import { createGist, createGitHubRepository } from "../src/lib/git";

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
});
