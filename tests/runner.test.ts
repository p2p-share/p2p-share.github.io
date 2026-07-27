import { emptyRunResult, getBrowserRunnerEngine, runnerEngineLabel } from "../src/lib/runner";

describe("code runner", () => {
  it("routes languages to browser-side engines", () => {
    expect(getBrowserRunnerEngine("javascript")).toBe("native-js");
    expect(getBrowserRunnerEngine("typescript", [{ name: "package.json", content: "{}" }])).toBe("webcontainer");
    expect(getBrowserRunnerEngine("python")).toBe("pyodide");
    expect(getBrowserRunnerEngine("ruby")).toBe("ruby-wasm");
    expect(getBrowserRunnerEngine("php")).toBe("php-wasm");
    expect(getBrowserRunnerEngine("lua")).toBe("fengari");
    expect(getBrowserRunnerEngine("r")).toBe("webr");
    expect(getBrowserRunnerEngine("sql")).toBe("sqlite-wasm");
    expect(getBrowserRunnerEngine("c")).toBe("wasmer-clang");
    expect(getBrowserRunnerEngine("cpp")).toBe("wasmer-clang");
    expect(getBrowserRunnerEngine("java")).toBe("cheerpj");
    expect(getBrowserRunnerEngine("go")).toBe("unsupported");
    expect(runnerEngineLabel("pyodide")).toContain("Pyodide");
    expect(emptyRunResult("peer-1", "Alex", "go")).toMatchObject({
      peerId: "peer-1",
      author: "Alex",
      language: "go",
      status: "running",
    });
  });
});
