import { useState } from "react";
import type { RunResult } from "../types";
import { getBrowserRunnerEngine, runnerEngineLabel } from "../lib/runner";
import { Icon } from "./Icons";

export function RunnerPanel({
  open,
  language,
  result,
  onRun,
  onClose,
}: {
  open: boolean;
  language: string;
  result?: RunResult;
  onRun: (stdin: string) => void;
  onClose: () => void;
}) {
  const [stdin, setStdin] = useState("");
  const engine = getBrowserRunnerEngine(language);
  const available = engine !== "unsupported";
  return (
    <section className={`runner-panel ${open ? "open" : ""}`} aria-label="Code runner">
      <header className="runner-head">
        <div><span className="eyebrow">Collaborative output</span><h2>Code runner</h2></div>
        <span className={`runner-mode ${available ? "local" : ""}`}>{runnerEngineLabel(engine)}</span>
        <button className="icon-button" onClick={onClose} aria-label="Close code runner"><Icon name="x" /></button>
      </header>
      <div className="runner-controls">
        {!["sandpack", "cheerpj", "sqlite-wasm"].includes(engine) && <label>Standard input
          <textarea rows={2} value={stdin} onChange={(event) => setStdin(event.target.value)} placeholder="Optional stdin" />
        </label>}
        <button className="primary-button run-button" disabled={result?.status === "running" || !available} onClick={() => onRun(stdin)}>
          <Icon name="play" /> {result?.status === "running" ? "Running…" : `Run ${language}`}
        </button>
      </div>
      <div className="runner-output">
        {!result ? <span>Run the current collaborative document to share its output with every peer.</span> : (
          <>
            <div className="output-meta"><strong>{result.status}</strong><span>by {result.author}</span>{result.durationMs !== undefined && <span>{result.durationMs} ms</span>}</div>
            {result.stdout && <pre className="stdout">{result.stdout}</pre>}
            {result.stderr && <pre className="stderr">{result.stderr}</pre>}
            {!result.stdout && !result.stderr && result.status !== "running" && <pre>(no output)</pre>}
          </>
        )}
      </div>
      <p className="runner-privacy"><Icon name="shield" />{
        engine === "wasmer-clang" ? "Wasm Clang runs locally; its first compiler download is large."
          : engine === "cheerpj" ? "CheerpJ runs compiled .class/.jar artifacts; Java source still needs compilation."
            : engine === "webcontainer" ? "Node projects run in a browser WebContainer when browser isolation permits."
              : engine === "sandpack" ? "Frontend projects compile with Sandpack; use Preview for interaction."
                : engine === "unsupported" ? "No browser runtime is configured for this format."
                  : "Execution stays in browser memory and its result is synchronized to peers."
      }</p>
    </section>
  );
}
