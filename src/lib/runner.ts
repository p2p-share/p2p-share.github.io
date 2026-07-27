import type { RunResult } from "../types";

const JUDGE_LANGUAGE_HINTS: Record<string, RegExp> = {
  python: /^Python /i,
  java: /^Java /i,
  cpp: /^C\+\+ /i,
  c: /^C \(/i,
  csharp: /^C# /i,
  go: /^Go /i,
  rust: /^Rust /i,
  kotlin: /^Kotlin /i,
  swift: /^Swift /i,
  ruby: /^Ruby /i,
  php: /^PHP /i,
  shell: /^Bash /i,
  typescript: /^TypeScript /i,
  javascript: /JavaScript|Node\.js/i,
};

export function canRunLocally(language: string) {
  return ["javascript", "typescript"].includes(language);
}

export async function runLocalCode(code: string, language: string, timeoutMs = 5000) {
  let executable = code;
  if (language === "typescript") {
    const ts = await import("typescript");
    const result = ts.transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
        strict: true,
      },
      reportDiagnostics: true,
    });
    const errors = result.diagnostics?.filter((item) => item.category === ts.DiagnosticCategory.Error) ?? [];
    if (errors.length) {
      throw new Error(errors.map((item) => ts.flattenDiagnosticMessageText(item.messageText, "\n")).join("\n"));
    }
    executable = result.outputText;
  }
  const workerSource = `
    const format = (value) => {
      if (typeof value === "string") return value;
      try { return JSON.stringify(value); } catch { return String(value); }
    };
    self.fetch = undefined;
    self.XMLHttpRequest = undefined;
    self.WebSocket = undefined;
    self.EventSource = undefined;
    self.importScripts = undefined;
    self.onmessage = async ({ data }) => {
      const stdout = [];
      const stderr = [];
      const console = {
        log: (...args) => stdout.push(args.map(format).join(" ")),
        info: (...args) => stdout.push(args.map(format).join(" ")),
        warn: (...args) => stderr.push(args.map(format).join(" ")),
        error: (...args) => stderr.push(args.map(format).join(" ")),
      };
      try {
        const execute = new Function("console", '"use strict"; return (async () => {\\n' + data + '\\n})()');
        const value = await execute(console);
        if (value !== undefined) stdout.push(format(value));
        self.postMessage({ stdout: stdout.join("\\n"), stderr: stderr.join("\\n") });
      } catch (error) {
        self.postMessage({ stdout: stdout.join("\\n"), stderr: [...stderr, error?.stack || String(error)].join("\\n") });
      }
    };
  `;
  const url = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
  const worker = new Worker(url);
  const started = performance.now();
  try {
    return await new Promise<{ stdout: string; stderr: string; durationMs: number }>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        worker.terminate();
        reject(new DOMException("Execution exceeded the 5 second limit.", "TimeoutError"));
      }, timeoutMs);
      worker.onmessage = (event) => {
        window.clearTimeout(timer);
        resolve({ ...event.data, durationMs: Math.round(performance.now() - started) });
      };
      worker.onerror = (event) => {
        window.clearTimeout(timer);
        reject(new Error(event.message));
      };
      worker.postMessage(executable);
    });
  } finally {
    worker.terminate();
    URL.revokeObjectURL(url);
  }
}

export async function runWithJudge0(
  endpoint: string,
  language: string,
  code: string,
  stdin: string,
) {
  const base = endpoint.replace(/\/+$/, "");
  const languages = await fetch(`${base}/languages`).then((response) => {
    if (!response.ok) throw new Error(`Runner returned HTTP ${response.status}.`);
    return response.json() as Promise<Array<{ id: number; name: string }>>;
  });
  const matcher = JUDGE_LANGUAGE_HINTS[language];
  const selected = matcher && languages.find((item) => matcher.test(item.name));
  if (!selected) throw new Error(`The configured runner does not offer ${language}.`);
  const submission = await fetch(`${base}/submissions?base64_encoded=false&wait=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source_code: code, language_id: selected.id, stdin }),
  });
  if (!submission.ok) throw new Error(`Runner returned HTTP ${submission.status}.`);
  const result = await submission.json() as {
    stdout?: string;
    stderr?: string;
    compile_output?: string;
    message?: string;
    time?: string;
    status?: { description?: string };
  };
  return {
    stdout: result.stdout || "",
    stderr: [result.compile_output, result.stderr, result.message].filter(Boolean).join("\n"),
    durationMs: Math.round(Number(result.time || 0) * 1000),
    description: result.status?.description,
  };
}

export function emptyRunResult(
  peerId: string,
  author: string,
  language: string,
): RunResult {
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
