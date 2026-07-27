import { useEffect, useMemo, useState } from "react";
import {
  createGist,
  createGitHubRepository,
  getGitHubUser,
  importGitHubRepository,
  importGitLabRepository,
  type PublishedCodeFile,
} from "../lib/git";
import { Icon } from "./Icons";

function MarkdownPreview({ value }: { value: string }) {
  return <div className="markdown-preview">
    {value.split("\n").map((line, index) => {
      if (line.startsWith("### ")) return <h4 key={index}>{line.slice(4)}</h4>;
      if (line.startsWith("## ")) return <h3 key={index}>{line.slice(3)}</h3>;
      if (line.startsWith("# ")) return <h2 key={index}>{line.slice(2)}</h2>;
      if (line.startsWith("- ")) return <li key={index}>{line.slice(2)}</li>;
      return <p key={index}>{line || "\u00a0"}</p>;
    })}
  </div>;
}

export function PublishPanel({
  open,
  files,
  description,
  visibility,
  source,
  onDescriptionChange,
  onVisibilityChange,
  onImport,
  onSourceChange,
  onClose,
}: {
  open: boolean;
  files: PublishedCodeFile[];
  description: string;
  visibility: "public" | "unlisted" | "private";
  source?: { url: string; branch: string; commit: string };
  onDescriptionChange: (value: string) => void;
  onVisibilityChange: (value: "public" | "unlisted" | "private") => void;
  onImport: (files: PublishedCodeFile[]) => void;
  onSourceChange: (source: { url: string; branch: string; commit: string }) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"publish" | "git">("publish");
  const [preview, setPreview] = useState(false);
  const [token, setToken] = useState(() => sessionStorage.getItem("p2p-share:github-token") || "");
  const [tokenInput, setTokenInput] = useState("");
  const [user, setUser] = useState<{ login: string; avatar_url: string; html_url: string }>();
  const [repoUrl, setRepoUrl] = useState("");
  const [repoName, setRepoName] = useState("p2p-share-snippet");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [resultUrl, setResultUrl] = useState("");

  useEffect(() => {
    if (token) void getGitHubUser(token).then(setUser).catch(() => {
      sessionStorage.removeItem("p2p-share:github-token");
      setToken("");
    });
  }, [token]);

  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.content.length, 0), [files]);
  const requireToken = () => {
    if (!token) throw new Error("Sign in with GitHub first.");
    return token;
  };
  const act = async (label: string, action: () => Promise<void>) => {
    setBusy(label); setError(""); setResultUrl("");
    try { await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Operation failed."); }
    finally { setBusy(""); }
  };
  return (
    <aside className={`publish-panel ${open ? "open" : ""}`} aria-label="Publish and Git integration">
      <header className="panel-heading"><div><span className="eyebrow">Publishing &amp; source control</span><h2>Publish code</h2></div><button className="icon-button" onClick={onClose} aria-label="Close publishing"><Icon name="x" /></button></header>
      <nav className="panel-tabs"><button className={tab === "publish" ? "active" : ""} onClick={() => setTab("publish")}>Publish</button><button className={tab === "git" ? "active" : ""} onClick={() => setTab("git")}>GitHub &amp; GitLab</button></nav>
      <div className="publish-body">
        {tab === "publish" ? <>
          <div className="publish-summary"><strong>{files.length} files</strong><span>{(totalSize / 1024).toFixed(1)} KB collaborative source</span></div>
          <div className="visibility-options">
            {(["private", "unlisted", "public"] as const).map((item) => <button className={visibility === item ? "active" : ""} key={item} onClick={() => onVisibilityChange(item)}><Icon name={item === "private" ? "lock" : item === "unlisted" ? "share" : "globe"} /><strong>{item}</strong><span>{item === "private" ? "P2P and local only" : item === "unlisted" ? "Secret Gist link" : "Public GitHub Gist"}</span></button>)}
          </div>
          <div className="description-head"><label>Markdown description</label><button className="text-button" onClick={() => setPreview((value) => !value)}>{preview ? "Edit" : "Preview"}</button></div>
          {preview ? <MarkdownPreview value={description} /> : <textarea rows={8} value={description} onChange={(event) => onDescriptionChange(event.target.value)} placeholder="# What this code does&#10;&#10;Add setup notes, usage, or review context…" />}
          <button className="primary-button" disabled={Boolean(busy) || visibility === "private"} onClick={() => void act("gist", async () => {
            const result = await createGist(requireToken(), description, files, visibility === "public");
            setResultUrl(result.html_url);
          })}><Icon name="publish" />{busy === "gist" ? "Publishing…" : visibility === "private" ? "Private stays in this room" : "Publish GitHub Gist"}</button>
        </> : <>
          <section className="github-auth">
            {user ? <div className="github-user"><img src={user.avatar_url} alt="" /><a href={user.html_url} target="_blank" rel="noreferrer">{user.login}</a><button className="text-button" onClick={() => { sessionStorage.removeItem("p2p-share:github-token"); setToken(""); setUser(undefined); }}>Sign out</button></div> : <>
              <label>Fine-grained GitHub access token
                <input type="password" autoComplete="off" value={tokenInput} onChange={(event) => setTokenInput(event.target.value)} placeholder="Stored only in this tab" />
              </label>
              <button className="secondary-button" disabled={!tokenInput || Boolean(busy)} onClick={() => void act("signin", async () => {
                const profile = await getGitHubUser(tokenInput);
                sessionStorage.setItem("p2p-share:github-token", tokenInput);
                setToken(tokenInput);
                setUser(profile);
                setTokenInput("");
              })}><Icon name="github" />{busy === "signin" ? "Connecting…" : "Sign in with GitHub token"}</button>
              <p className="auth-help">Use a fine-grained token with Gists and repository permissions. It remains in session storage and is cleared when the tab session ends.</p>
            </>}
          </section>
          <section className="git-action">
            <label>GitHub or GitLab repository URL<input value={repoUrl} onChange={(event) => setRepoUrl(event.target.value)} placeholder="https://github.com/owner/repository" /></label>
            <button className="secondary-button" disabled={!repoUrl || Boolean(busy)} onClick={() => void act("import", async () => {
              const result = repoUrl.includes("gitlab.com") ? await importGitLabRepository(repoUrl) : await importGitHubRepository(repoUrl, token || undefined);
              onImport(result.files); onSourceChange({ url: result.url, branch: result.branch, commit: result.commit });
            })}><Icon name="download" />{busy === "import" ? "Importing repository…" : "Import repository"}</button>
          </section>
          <section className="git-action">
            <label>New GitHub repository name<input value={repoName} onChange={(event) => setRepoName(event.target.value.replace(/[^a-zA-Z0-9._-]/g, "-"))} /></label>
            <button className="primary-button" disabled={!repoName || Boolean(busy)} onClick={() => void act("export", async () => {
              const result = await createGitHubRepository(requireToken(), repoName, description, files, visibility === "private" ? "private" : "public");
              setResultUrl(result.html_url); onSourceChange({ url: result.html_url, branch: result.default_branch, commit: "" });
            })}><Icon name="github" />{busy === "export" ? "Creating repository…" : "Export as Git repository"}</button>
          </section>
          {source && <div className="source-link"><span>Linked source</span><a href={source.url} target="_blank" rel="noreferrer">{source.url}</a><code>{source.branch}{source.commit ? ` @ ${source.commit.slice(0, 10)}` : ""}</code></div>}
        </>}
        {resultUrl && <a className="publish-result" href={resultUrl} target="_blank" rel="noreferrer"><Icon name="check" /> Published successfully — open result</a>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </aside>
  );
}
