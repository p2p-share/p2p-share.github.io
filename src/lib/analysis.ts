import type { AnalysisReport } from "../types";

type Pending = { resolve: (value: any) => void; reject: (reason: Error) => void };
let worker: Worker | undefined;
const pending = new Map<string, Pending>();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("../workers/analysis.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<{ id: string; result?: unknown; error?: string }>) => {
    const task = pending.get(event.data.id);
    if (!task) return;
    pending.delete(event.data.id);
    if (event.data.error) task.reject(new Error(event.data.error));
    else task.resolve(event.data.result);
  };
  return worker;
}

function request<T>(payload: Record<string, unknown>) {
  const id = crypto.randomUUID();
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, ...payload });
  });
}

export const analyzeCode = (content: string, language: string) =>
  request<AnalysisReport>({ action: "analyze", content, language });

export const formatCode = (content: string, language: string, tabSize: number) =>
  request<string>({ action: "format", content, language, tabSize });
