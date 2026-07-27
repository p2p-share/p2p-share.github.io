import { canRunLocally, emptyRunResult, runWithJudge0 } from "../src/lib/runner";

describe("code runner", () => {
  it("keeps JavaScript and TypeScript execution local", () => {
    expect(canRunLocally("javascript")).toBe(true);
    expect(canRunLocally("typescript")).toBe(true);
    expect(canRunLocally("python")).toBe(false);
    expect(emptyRunResult("peer-1", "Alex", "go")).toMatchObject({
      peerId: "peer-1",
      author: "Alex",
      language: "go",
      status: "running",
    });
  });

  it("discovers the language and submits to a configured Judge0 endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 71, name: "Python (3.8.1)" }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        stdout: "42\n",
        stderr: null,
        time: "0.012",
        status: { description: "Accepted" },
      }), { status: 200 }));

    await expect(runWithJudge0("https://runner.example/", "python", "print(42)", "")).resolves.toEqual({
      stdout: "42\n",
      stderr: "",
      durationMs: 12,
      description: "Accepted",
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://runner.example/submissions?base64_encoded=false&wait=true");
    fetchMock.mockRestore();
  });
});
