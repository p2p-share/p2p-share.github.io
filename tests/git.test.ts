import { createGist, createGitHubRepository, importGitHubRepository } from "../src/lib/git";

describe("GitHub publishing", () => {
  afterEach(() => vi.restoreAllMocks());

  it("publishes every collaborative file in a gist", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ html_url: "https://gist.github.com/example" }), { status: 201 }),
    );
    await createGist("token", "# Demo", [
      { name: "app.js", content: "console.log(1)" },
      { name: "README.md", content: "# Demo" },
    ], false);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      public: false,
      files: {
        "app.js": { content: "console.log(1)" },
        "README.md": { content: "# Demo" },
      },
    });
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer token");
  });

  it("creates a repository and uploads all files to its default branch", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        full_name: "alex/demo",
        html_url: "https://github.com/alex/demo",
        default_branch: "main",
      }), { status: 201 }))
      .mockImplementation(async () =>
        new Response(JSON.stringify({ content: {} }), { status: 201 }),
      );
    await createGitHubRepository("token", "demo", "Description", [
      { name: "src/app.js", content: "hello" },
      { name: "README.md", content: "readme" },
    ], "private");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/contents/src/app.js");
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ branch: "main" });
  });

  it("imports a public repository through the CORS-enabled CDN without GitHub authentication", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        files: [
          { type: "directory", name: "src", files: [{ type: "file", name: "app.ts", size: 27 }] },
          { type: "file", name: "README.md", size: 7 },
          { type: "file", name: "large.txt", size: 2_000_000 },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response("export const ready = true;\n", { status: 200 }))
      .mockResolvedValueOnce(new Response("# Demo\n", { status: 200 }));

    const result = await importGitHubRepository("https://github.com/alex/demo");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://data.jsdelivr.com/v1/package/gh/alex/demo@main");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("https://cdn.jsdelivr.net/gh/alex/demo@main/");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("api.github.com"))).toBe(false);
    expect(result.files).toEqual([
      { name: "src/app.ts", content: "export const ready = true;\n" },
      { name: "README.md", content: "# Demo\n" },
    ]);
    expect(result.branch).toBe("main");
  });
});
