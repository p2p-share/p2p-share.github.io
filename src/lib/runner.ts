import type { FileSystemTree, WebContainer } from "@webcontainer/api";
import type { RunResult } from "../types";

export type RunnerProjectFile = {
  id?: string;
  name: string;
  content: string;
  language?: string;
};

export type BrowserRunnerEngine =
  | "native-js"
  | "pyodide"
  | "webcontainer"
  | "sandpack"
  | "ruby-wasm"
  | "php-wasm"
  | "fengari"
  | "webr"
  | "sqlite-wasm"
  | "wasmer-clang"
  | "cheerpj"
  | "unsupported";

export type BrowserRunOutput = {
  stdout: string;
  stderr: string;
  durationMs: number;
};

let webContainerPromise: Promise<WebContainer> | undefined;
let pyodidePromise: Promise<Awaited<ReturnType<typeof import("pyodide")["loadPyodide"]>>> | undefined;
let wasmerInitialized: Promise<unknown> | undefined;
let rubyVmPromise: Promise<unknown> | undefined;
let webRPromise: Promise<unknown> | undefined;

function isFrontendProject(files: RunnerProjectFile[]) {
  return files.some((file) => /(^|\/)index\.html$/i.test(file.name))
    || files.some((file) => /(^|\/)(vite\.config|src\/.*\.(jsx|tsx))/.test(file.name));
}

export function getBrowserRunnerEngine(language: string, files: RunnerProjectFile[] = []): BrowserRunnerEngine {
  const normalized = language.toLowerCase();
  if (normalized === "python") return "pyodide";
  if (normalized === "ruby") return "ruby-wasm";
  if (normalized === "php") return "php-wasm";
  if (normalized === "lua") return "fengari";
  if (normalized === "r") return "webr";
  if (["sql", "sqlite"].includes(normalized)) return "sqlite-wasm";
  if (["c", "cpp", "c++"].includes(normalized)) return "wasmer-clang";
  if (normalized === "java") return "cheerpj";
  if (["html", "css"].includes(normalized) || isFrontendProject(files)) return "sandpack";
  if (["javascript", "typescript"].includes(normalized)) {
    return files.some((file) => /(^|\/)package\.json$/i.test(file.name)) ? "webcontainer" : "native-js";
  }
  return "unsupported";
}

export function runnerEngineLabel(engine: BrowserRunnerEngine) {
  return {
    "native-js": "Native browser JavaScript/TypeScript",
    pyodide: "Pyodide · browser Python",
    webcontainer: "WebContainer · browser Node.js",
    sandpack: "Sandpack · frontend playground",
    "ruby-wasm": "ruby.wasm · browser Ruby",
    "php-wasm": "PHP Wasm · browser PHP",
    fengari: "Fengari · browser Lua",
    webr: "WebR · browser R",
    "sqlite-wasm": "SQLite Wasm · browser SQL",
    "wasmer-clang": "Wasm Clang · C/C++",
    cheerpj: "CheerpJ · compiled Java",
    unsupported: "No browser runtime",
  }[engine];
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function runNative(code: string, language: string): Promise<BrowserRunOutput> {
  const started = performance.now();
  let executable = code;
  if (language === "typescript") {
    const ts = await import("typescript");
    executable = ts.transpile(code, {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    });
  }
  const workerSource = `
    const send = (stream, values) => postMessage({ stream, text: values.map((v) =>
      typeof v === "string" ? v : (() => { try { return JSON.stringify(v); } catch { return String(v); } })()
    ).join(" ") });
    console = {
      log: (...v) => send("stdout", v), info: (...v) => send("stdout", v),
      warn: (...v) => send("stderr", v), error: (...v) => send("stderr", v)
    };
    fetch = () => Promise.reject(new Error("Network access is disabled in the local runner."));
    XMLHttpRequest = WebSocket = EventSource = undefined;
    try {
      const value = (0, eval)(${JSON.stringify(executable)});
      Promise.resolve(value).then((result) => {
        if (result !== undefined) send("stdout", [result]);
        postMessage({ done: true });
      }, (error) => { send("stderr", [error?.stack || error]); postMessage({ done: true }); });
    } catch (error) { send("stderr", [error?.stack || error]); postMessage({ done: true }); }
  `;
  const url = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
  const worker = new Worker(url);
  const stdout: string[] = [];
  const stderr: string[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new DOMException("Execution exceeded 5 seconds.", "TimeoutError")), 5_000);
      worker.onmessage = (event: MessageEvent<{ stream?: "stdout" | "stderr"; text?: string; done?: boolean }>) => {
        if (event.data.stream && event.data.text !== undefined) (event.data.stream === "stdout" ? stdout : stderr).push(event.data.text);
        if (event.data.done) {
          window.clearTimeout(timer);
          resolve();
        }
      };
      worker.onerror = (event) => {
        window.clearTimeout(timer);
        reject(new Error(event.message));
      };
    });
  } finally {
    worker.terminate();
    URL.revokeObjectURL(url);
  }
  return { stdout: stdout.join("\n"), stderr: stderr.join("\n"), durationMs: Math.round(performance.now() - started) };
}

async function runPython(code: string, stdin: string): Promise<BrowserRunOutput> {
  const started = performance.now();
  const { loadPyodide } = await import("pyodide");
  pyodidePromise ||= loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.29.4/full/" });
  const pyodide = await pyodidePromise;
  const stdout: string[] = [];
  const stderr: string[] = [];
  const input = stdin.split(/\r?\n/);
  pyodide.setStdout({ batched: (value) => stdout.push(value) });
  pyodide.setStderr({ batched: (value) => stderr.push(value) });
  pyodide.setStdin({ stdin: () => input.shift() ?? null });
  try {
    const value = await pyodide.runPythonAsync(code);
    if (value !== undefined && value !== null) stdout.push(String(value));
  } catch (error) {
    stderr.push(errorText(error));
  }
  return { stdout: stdout.join("\n"), stderr: stderr.join("\n"), durationMs: Math.round(performance.now() - started) };
}

function buildFileTree(files: RunnerProjectFile[]): FileSystemTree {
  const root: FileSystemTree = {};
  for (const file of files) {
    const parts = file.name.replace(/^\/+/, "").split("/").filter(Boolean);
    if (!parts.length) continue;
    let directory = root;
    for (const part of parts.slice(0, -1)) {
      const existing = directory[part];
      if (!existing || !("directory" in existing)) directory[part] = { directory: {} };
      directory = (directory[part] as { directory: FileSystemTree }).directory;
    }
    directory[parts.at(-1)!] = { file: { contents: file.content } };
  }
  return root;
}

async function runNode(activeFile: RunnerProjectFile, files: RunnerProjectFile[], stdin: string): Promise<BrowserRunOutput> {
  if (!globalThis.crossOriginIsolated && !/Chrome|Chromium|Edg\//.test(navigator.userAgent)) {
    throw new Error("WebContainers require cross-origin isolation in this browser. Use current Chrome/Edge or a host with COOP/COEP headers.");
  }
  const started = performance.now();
  const { WebContainer } = await import("@webcontainer/api");
  webContainerPromise ||= WebContainer.boot({ coep: globalThis.crossOriginIsolated ? "require-corp" : "none" });
  const container = await webContainerPromise;
  try { await container.fs.rm("project", { recursive: true, force: true }); } catch { /* first run */ }
  await container.mount(buildFileTree(files), { mountPoint: "project" });
  const packageFile = files.find((file) => /(^|\/)package\.json$/i.test(file.name));
  let command = "node";
  let args = [activeFile.name];
  if (packageFile) {
    const manifest = JSON.parse(packageFile.content) as { scripts?: Record<string, string> };
    const script = manifest.scripts?.start ? "start" : manifest.scripts?.dev ? "dev" : undefined;
    const install = await container.spawn("npm", ["install", "--no-audit", "--no-fund"], { cwd: `${container.workdir}/project` });
    if (await install.exit !== 0) throw new Error("WebContainer dependency installation failed.");
    if (!script) throw new Error("package.json needs a start or dev script.");
    command = "npm";
    args = ["run", script];
  }
  const process = await container.spawn(command, args, { cwd: `${container.workdir}/project` });
  if (stdin) {
    const writer = process.input.getWriter();
    await writer.write(stdin);
    await writer.close();
  }
  let output = "";
  await process.output.pipeTo(new WritableStream({ write: (chunk) => { output += chunk; } }));
  const exitCode = await process.exit;
  return {
    stdout: exitCode === 0 ? output.trimEnd() : "",
    stderr: exitCode === 0 ? "" : output.trimEnd() || `Node process exited with code ${exitCode}.`,
    durationMs: Math.round(performance.now() - started),
  };
}

async function runFrontend(files: RunnerProjectFile[]): Promise<BrowserRunOutput> {
  const started = performance.now();
  const iframe = document.createElement("iframe");
  iframe.hidden = true;
  iframe.sandbox.add("allow-scripts");
  document.body.append(iframe);
  let client: { destroy(): void } | undefined;
  try {
    const { loadSandpackClient } = await import("@codesandbox/sandpack-client");
    const packageFile = files.find((file) => /(^|\/)package\.json$/i.test(file.name));
    const dependencies = packageFile
      ? (JSON.parse(packageFile.content) as { dependencies?: Record<string, string> }).dependencies
      : undefined;
    client = await loadSandpackClient(iframe, {
      files: Object.fromEntries(files.map((file) => [`/${file.name.replace(/^\/+/, "")}`, { code: file.content }])),
      dependencies,
      template: dependencies?.react ? "create-react-app" : "static",
    }, { showOpenInCodeSandbox: false, showErrorScreen: false, showLoadingScreen: false });
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
    return { stdout: "Frontend playground started. Open Preview to interact with it.", stderr: "", durationMs: Math.round(performance.now() - started) };
  } finally {
    client?.destroy();
    iframe.remove();
  }
}

async function runRuby(code: string): Promise<BrowserRunOutput> {
  const started = performance.now();
  if (!rubyVmPromise) {
    rubyVmPromise = (async () => {
      const { DefaultRubyVM } = await import("@ruby/wasm-wasi/dist/browser");
      const response = fetch("https://cdn.jsdelivr.net/npm/@ruby/4.0-wasm-wasi@2.9.3-2.9.4/dist/ruby+stdlib.wasm");
      const module = await WebAssembly.compileStreaming(response);
      return (await DefaultRubyVM(module)).vm;
    })();
  }
  const vm = await rubyVmPromise as { eval(source: string): { toString(): string } };
  try {
    const source = `require "stringio"; __p2p_out = StringIO.new; __p2p_old = $stdout; $stdout = __p2p_out; begin; eval(${JSON.stringify(code)}); ensure; $stdout = __p2p_old; end; __p2p_out.string`;
    return { stdout: vm.eval(source).toString(), stderr: "", durationMs: Math.round(performance.now() - started) };
  } catch (error) {
    return { stdout: "", stderr: errorText(error), durationMs: Math.round(performance.now() - started) };
  }
}

async function runPhp(code: string): Promise<BrowserRunOutput> {
  const started = performance.now();
  // Keep the many PHP engine variants out of the GitHub Pages bundle. The selected
  // browser module and its Wasm payload are fetched only when PHP is first run.
  const phpModuleUrl = "https://cdn.jsdelivr.net/npm/php-wasm@0.1.0/PhpWeb.mjs";
  const { PhpWeb } = await import(/* @vite-ignore */ phpModuleUrl) as typeof import("php-wasm/PhpWeb");
  const php = new PhpWeb();
  const stdout: string[] = [];
  const stderr: string[] = [];
  const target = php as unknown as EventTarget;
  target.addEventListener("output", (event) => stdout.push(String((event as CustomEvent<unknown[]>).detail?.[0] ?? "")));
  target.addEventListener("error", (event) => stderr.push(String((event as CustomEvent<unknown[]>).detail?.[0] ?? "")));
  try {
    await php.run(code.includes("<?php") ? code : `<?php\n${code}`);
  } catch (error) {
    stderr.push(errorText(error));
  }
  return { stdout: stdout.join(""), stderr: stderr.join(""), durationMs: Math.round(performance.now() - started) };
}

async function runLua(code: string): Promise<BrowserRunOutput> {
  const started = performance.now();
  const fengari = await import("fengari");
  const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;
  const state = lauxlib.luaL_newstate();
  const stdout: string[] = [];
  lualib.luaL_openlibs(state);
  lua.lua_pushjsfunction(state, (inner: unknown) => {
    const current = inner as typeof state;
    const values = [];
    for (let index = 1; index <= lua.lua_gettop(current); index += 1) values.push(to_jsstring(lua.lua_tolstring(current, index)));
    stdout.push(values.join("\t"));
    return 0;
  });
  lua.lua_setglobal(state, to_luastring("print"));
  const status = lauxlib.luaL_dostring(state, to_luastring(code));
  const stderr = status === lua.LUA_OK ? "" : to_jsstring(lua.lua_tolstring(state, -1));
  return { stdout: stdout.join("\n"), stderr, durationMs: Math.round(performance.now() - started) };
}

async function runR(code: string): Promise<BrowserRunOutput> {
  const started = performance.now();
  if (!webRPromise) {
    webRPromise = import("webr").then(async ({ WebR }) => {
      const instance = new WebR();
      await instance.init();
      return instance;
    });
  }
  const webR = await webRPromise as { captureR(source: string): Promise<{ output: Array<{ type: string; data: unknown }> }> };
  try {
    const captured = await webR.captureR(code);
    const stdout = captured.output.filter((item) => item.type !== "stderr").map((item) => String(item.data)).join("\n");
    const stderr = captured.output.filter((item) => item.type === "stderr").map((item) => String(item.data)).join("\n");
    return { stdout, stderr, durationMs: Math.round(performance.now() - started) };
  } catch (error) {
    return { stdout: "", stderr: errorText(error), durationMs: Math.round(performance.now() - started) };
  }
}

async function runSql(code: string): Promise<BrowserRunOutput> {
  const started = performance.now();
  const { default: sqlite3InitModule } = await import("@sqlite.org/sqlite-wasm");
  const sqlite3 = await sqlite3InitModule();
  const db = new sqlite3.oo1.DB(":memory:");
  try {
    const rows: unknown[] = [];
    db.exec({ sql: code, rowMode: "object", callback: (row: unknown) => { rows.push(row); } });
    return { stdout: rows.length ? JSON.stringify(rows, null, 2) : "Query completed successfully.", stderr: "", durationMs: Math.round(performance.now() - started) };
  } catch (error) {
    return { stdout: "", stderr: errorText(error), durationMs: Math.round(performance.now() - started) };
  } finally {
    db.close();
  }
}

async function runClang(code: string, language: string): Promise<BrowserRunOutput> {
  const started = performance.now();
  const sdk = await import("@wasmer/sdk");
  wasmerInitialized ||= sdk.init();
  await wasmerInitialized;
  const clang = await sdk.Wasmer.fromRegistry("clang/clang");
  const project = new sdk.Directory();
  const sourceName = language === "cpp" ? "main.cpp" : "main.c";
  await project.writeFile(sourceName, code);
  if (!clang.entrypoint) throw new Error("The Wasm Clang package has no runnable entrypoint.");
  const compile = await clang.entrypoint.run({
    args: [`/project/${sourceName}`, "-o", "/project/main.wasm", ...(language === "cpp" ? ["-x", "c++"] : [])],
    mount: { "/project": project },
  });
  const compileOutput = await compile.wait();
  if (!compileOutput.ok) return { stdout: compileOutput.stdout, stderr: compileOutput.stderr, durationMs: Math.round(performance.now() - started) };
  const program = await sdk.Wasmer.fromFile(await project.readFile("main.wasm"));
  if (!program.entrypoint) throw new Error("The compiled Wasm program has no runnable entrypoint.");
  const output = await (await program.entrypoint.run()).wait();
  return { stdout: output.stdout, stderr: output.stderr, durationMs: Math.round(performance.now() - started) };
}

export async function runBrowserCode(activeFile: RunnerProjectFile, files: RunnerProjectFile[], stdin: string): Promise<BrowserRunOutput> {
  const language = (activeFile.language || "text").toLowerCase();
  const engine = getBrowserRunnerEngine(language, files);
  if (engine === "native-js") return runNative(activeFile.content, language);
  if (engine === "pyodide") return runPython(activeFile.content, stdin);
  if (engine === "webcontainer") return runNode(activeFile, files, stdin);
  if (engine === "sandpack") return runFrontend(files);
  if (engine === "ruby-wasm") return runRuby(activeFile.content);
  if (engine === "php-wasm") return runPhp(activeFile.content);
  if (engine === "fengari") return runLua(activeFile.content);
  if (engine === "webr") return runR(activeFile.content);
  if (engine === "sqlite-wasm") return runSql(activeFile.content);
  if (engine === "wasmer-clang") return runClang(activeFile.content, language);
  if (engine === "cheerpj") throw new Error("CheerpJ runs compiled .class or .jar files. Java source compilation is not available in this browser runner.");
  throw new Error(`No browser-side runtime is available for ${language}.`);
}

export function emptyRunResult(peerId: string, author: string, language: string): RunResult {
  return {
    id: crypto.randomUUID(),
    peerId,
    author,
    language,
    status: "running",
    stdout: "",
    stderr: "",
    timestamp: Date.now(),
  };
}
