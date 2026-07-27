export type PublishedCodeFile = { name: string; content: string };

const githubHeaders = (token?: string) => ({
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2026-03-10",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

async function github<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { ...githubHeaders(token), ...(init?.headers || {}) },
  });
  if (!response.ok) throw new Error(`GitHub returned ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

export function getGitHubUser(token: string) {
  return github<{ login: string; avatar_url: string; html_url: string }>("/user", token);
}

export function createGist(
  token: string,
  description: string,
  files: PublishedCodeFile[],
  isPublic: boolean,
) {
  return github<{ html_url: string; git_pull_url: string }>("/gists", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      description,
      public: isPublic,
      files: Object.fromEntries(files.map((file) => [file.name, { content: file.content }])),
    }),
  });
}

function base64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function createGitHubRepository(
  token: string,
  name: string,
  description: string,
  files: PublishedCodeFile[],
  visibility: "public" | "private",
) {
  const repo = await github<{ full_name: string; html_url: string; default_branch: string }>("/user/repos", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description, private: visibility === "private", auto_init: true }),
  });
  for (const file of files) {
    await github(`/repos/${repo.full_name}/contents/${file.name.split("/").map(encodeURIComponent).join("/")}`, token, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Add ${file.name} from p2p-share`,
        content: base64Utf8(file.content),
        branch: repo.default_branch,
      }),
    });
  }
  return repo;
}

export async function importGitHubRepository(url: string, token?: string) {
  const parsed = new URL(url);
  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parsed.hostname !== "github.com" || parts.length < 2) throw new Error("Enter a GitHub repository URL.");
  const [owner, repo] = parts;
  const info = await github<{ default_branch: string }>(`/repos/${owner}/${repo}`, token);
  const branchIndex = parts.indexOf("tree");
  const branch = branchIndex >= 0 ? parts[branchIndex + 1] : info.default_branch;
  const commit = await github<{ sha: string; commit: { tree: { sha: string } } }>(
    `/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`, token,
  );
  const tree = await github<{ sha: string; tree: Array<{ path: string; type: string; size?: number; url: string }> }>(
    `/repos/${owner}/${repo}/git/trees/${commit.commit.tree.sha}?recursive=1`, token,
  );
  const candidates = tree.tree.filter((item) => item.type === "blob" && (item.size || 0) <= 1_000_000).slice(0, 100);
  const files: PublishedCodeFile[] = [];
  for (const item of candidates) {
    const blob = await github<{ content: string; encoding: string }>(new URL(item.url).pathname, token);
    if (blob.encoding !== "base64") continue;
    try {
      const binary = atob(blob.content.replace(/\s/g, ""));
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      files.push({ name: item.path, content });
    } catch {
      // Binary and non-UTF-8 blobs are intentionally skipped.
    }
  }
  return { files, branch, commit: commit.sha, url: `https://github.com/${owner}/${repo}` };
}

export async function importGitLabRepository(url: string) {
  const parsed = new URL(url);
  if (parsed.hostname !== "gitlab.com") throw new Error("Enter a public GitLab repository URL.");
  const marker = parsed.pathname.indexOf("/-/");
  const projectPath = (marker >= 0 ? parsed.pathname.slice(0, marker) : parsed.pathname).replace(/^\/|\/$/g, "");
  const project = encodeURIComponent(projectPath);
  const infoResponse = await fetch(`https://gitlab.com/api/v4/projects/${project}`);
  if (!infoResponse.ok) throw new Error(`GitLab returned ${infoResponse.status}.`);
  const info = await infoResponse.json() as { default_branch: string; web_url: string };
  const treeResponse = await fetch(`https://gitlab.com/api/v4/projects/${project}/repository/tree?recursive=true&per_page=100&ref=${encodeURIComponent(info.default_branch)}`);
  if (!treeResponse.ok) throw new Error(`GitLab returned ${treeResponse.status}.`);
  const tree = await treeResponse.json() as Array<{ path: string; type: string }>;
  const commitResponse = await fetch(`https://gitlab.com/api/v4/projects/${project}/repository/commits/${encodeURIComponent(info.default_branch)}`);
  const commit = commitResponse.ok ? await commitResponse.json() as { id: string } : undefined;
  const files: PublishedCodeFile[] = [];
  for (const item of tree.filter((entry) => entry.type === "blob").slice(0, 100)) {
    const raw = await fetch(`https://gitlab.com/api/v4/projects/${project}/repository/files/${encodeURIComponent(item.path)}/raw?ref=${encodeURIComponent(info.default_branch)}`);
    if (!raw.ok) continue;
    if (Number(raw.headers.get("content-length") || 0) > 1_000_000) continue;
    const content = await raw.text();
    if (content.length > 1_000_000) continue;
    if (!content.includes("\0")) files.push({ name: item.path, content });
  }
  return { files, branch: info.default_branch, commit: commit?.id || "", url: info.web_url };
}
