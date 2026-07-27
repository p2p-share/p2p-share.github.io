import { useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisReport } from "../types";
import type { ProjectFile } from "../lib/project";
import { Icon } from "./Icons";

type Tool = "analysis" | "preview" | "utilities";
type Viewport = "mobile" | "tablet" | "desktop";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]!));

function markdownHtml(source: string) {
  return source.split(/\r?\n/).map((line) => {
    const safe = escapeHtml(line)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
    const heading = safe.match(/^(#{1,6})\s+(.+)/);
    if (heading) return `<h${heading[1].length}>${heading[2]}</h${heading[1].length}>`;
    if (/^[-*]\s+/.test(safe)) return `<li>${safe.slice(2)}</li>`;
    return safe ? `<p>${safe}</p>` : "<br>";
  }).join("");
}

function csp() {
  return "default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'self' blob:; connect-src 'none'; font-src data:; form-action 'none'; base-uri 'none'; frame-src 'none'; object-src 'none'";
}

function previewScript(files: ProjectFile[], active: ProjectFile, inspect: boolean) {
  const htmlFile = active.language === "html" ? active : files.find((file) => file.language === "html");
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(htmlFile?.content || "", "text/html");
  const inline = [...documentNode.querySelectorAll("script:not([src])")].map((script) => script.textContent || "").join("\n");
  const js = files.filter((file) => ["javascript", "typescript", "jsx", "tsx"].includes(file.language)).map((file) => file.content).join("\n");
  return `
    (() => {
      const send = (type, values) => parent.postMessage({source:"p2p-preview",type,values:values.map(v => {
        try { return typeof v === "string" ? v : JSON.stringify(v); } catch { return String(v); }
      })}, "*");
      for (const type of ["log","info","warn","error"]) {
        const original = console[type]; console[type] = (...values) => { send(type, values); original(...values); };
      }
      addEventListener("error", event => send("error", [event.message]));
      ${inspect ? `addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation();
        const el = event.target;
        send("inspect", [el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.className ? "." + String(el.className).trim().replace(/\\s+/g, ".") : "")]);
      }, true);` : ""}
    })();
    ${inline}
    ${js}`;
}

function previewDocument(files: ProjectFile[], active: ProjectFile, javaScript: boolean) {
  const htmlFile = active.language === "html" ? active : files.find((file) => file.language === "html");
  const css = files.filter((file) => ["css", "sass"].includes(file.language)).map((file) => file.content).join("\n");
  const raw = htmlFile?.content || "<main><h1>Local preview</h1><p>Add an HTML file to this project.</p></main>";
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(raw, "text/html");
  documentNode.querySelectorAll("meta[http-equiv='Content-Security-Policy'], base, script").forEach((node) => node.remove());
  const policy = documentNode.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content = csp();
  documentNode.head.prepend(policy);
  const style = documentNode.createElement("style");
  style.textContent = `html{color-scheme:light dark}body{font:14px/1.5 system-ui;margin:20px}${css}`;
  documentNode.head.append(style);
  if (javaScript) {
    const projectScript = documentNode.createElement("script");
    projectScript.src = "./preview-runtime.js";
    documentNode.body.append(projectScript);
  }
  return `<!doctype html>${documentNode.documentElement.outerHTML}`;
}

function JsonTree({ value, name }: { value: unknown; name?: string }) {
  if (value && typeof value === "object") {
    const entries = Array.isArray(value) ? value.map((item, index) => [String(index), item] as const) : Object.entries(value);
    return <details open className="json-node"><summary>{name && <strong>{name}: </strong>}{Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}</summary>{entries.map(([key, item]) => <JsonTree key={key} name={key} value={item} />)}</details>;
  }
  return <div className="json-leaf"><strong>{name}: </strong><span>{JSON.stringify(value)}</span></div>;
}

export function WorkbenchPanel({
  open,
  files,
  activeFile,
  report,
  analyzing,
  onAnalyze,
  onFormat,
  onApplyText,
  onClose,
}: {
  open: boolean;
  files: ProjectFile[];
  activeFile: ProjectFile;
  report?: AnalysisReport;
  analyzing: boolean;
  onAnalyze: () => void;
  onFormat: () => void;
  onApplyText: (value: string) => void;
  onClose: () => void;
}) {
  const [tool, setTool] = useState<Tool>("analysis");
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [javaScript, setJavaScript] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [inspect, setInspect] = useState(false);
  const [reload, setReload] = useState(0);
  const [consoleLines, setConsoleLines] = useState<Array<{ type: string; value: string }>>([]);
  const [regex, setRegex] = useState("");
  const [regexFlags, setRegexFlags] = useState("g");
  const [base64, setBase64] = useState("");
  const [mermaidSvg, setMermaidSvg] = useState("");
  const iframe = useRef<HTMLIFrameElement>(null);

  const mode = useMemo(() => {
    if (activeFile.language === "markdown") return "markdown";
    if (activeFile.language === "json") return "json";
    if (activeFile.name.toLowerCase().endsWith(".csv")) return "csv";
    if (activeFile.name.toLowerCase().endsWith(".svg")) return "svg";
    if (activeFile.name.toLowerCase().match(/\.(diff|patch)$/)) return "diff";
    if (activeFile.name.toLowerCase().match(/\.(mmd|mermaid)$/)) return "mermaid";
    return "web";
  }, [activeFile]);
  const scriptContent = useMemo(() => previewScript(files, activeFile, inspect), [files, activeFile, inspect]);
  const generatedPreview = useMemo(
    () => previewDocument(files, activeFile, javaScript),
    [files, activeFile, javaScript],
  );
  const [preview, setPreview] = useState(generatedPreview);
  useEffect(() => {
    if (autoRefresh) setPreview(generatedPreview);
  }, [autoRefresh, generatedPreview]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== iframe.current?.contentWindow || event.data?.source !== "p2p-preview") return;
      setConsoleLines((current) => [...current.slice(-199), {
        type: String(event.data.type),
        value: Array.isArray(event.data.values) ? event.data.values.join(" ") : "",
      }]);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);

  useEffect(() => {
    if (mode !== "mermaid") return;
    let active = true;
    void import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral" });
      return mermaid.render(`p2p-mermaid-${crypto.randomUUID().replaceAll("-", "")}`, activeFile.content);
    }).then(({ svg }) => active && setMermaidSvg(svg))
      .catch((error) => active && setMermaidSvg(`<pre>${escapeHtml(error instanceof Error ? error.message : "Invalid Mermaid diagram")}</pre>`));
    return () => { active = false; };
  }, [activeFile.content, mode]);

  if (!open) return null;
  let specialPreview: React.ReactNode;
  if (mode === "markdown") specialPreview = <article className="markdown-local" dangerouslySetInnerHTML={{ __html: markdownHtml(activeFile.content) }} />;
  if (mode === "json") {
    try { specialPreview = <div className="json-tree"><JsonTree value={JSON.parse(activeFile.content)} /></div>; }
    catch (error) { specialPreview = <p className="preview-error">{error instanceof Error ? error.message : "Invalid JSON"}</p>; }
  }
  if (mode === "csv") {
    const rows = activeFile.content.split(/\r?\n/).filter(Boolean).slice(0, 1_000).map((row) => row.split(","));
    specialPreview = <div className="csv-scroll"><table><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => rowIndex ? <td key={cellIndex}>{cell}</td> : <th key={cellIndex}>{cell}</th>)}</tr>)}</tbody></table></div>;
  }
  if (mode === "diff") specialPreview = <pre className="diff-view">{activeFile.content.split(/\r?\n/).map((line, index) => <span className={line.startsWith("+") ? "added" : line.startsWith("-") ? "removed" : line.startsWith("@@") ? "hunk" : ""} key={index}>{line}{"\n"}</span>)}</pre>;
  if (mode === "svg" || mode === "mermaid") specialPreview = <iframe title={`${mode} preview`} sandbox="" referrerPolicy="no-referrer" srcDoc={`<!doctype html><meta http-equiv="Content-Security-Policy" content="${csp()}"><style>body{margin:16px;background:white;color:#111}svg{max-width:100%;height:auto}</style>${mode === "svg" ? activeFile.content : mermaidSvg}`} />;

  let regexResult = "";
  try {
    if (regex) regexResult = [...activeFile.content.matchAll(new RegExp(regex, regexFlags.includes("g") ? regexFlags : `${regexFlags}g`))].slice(0, 500).map((match) => `${match.index}: ${match[0]}`).join("\n");
  } catch (error) { regexResult = error instanceof Error ? error.message : "Invalid expression"; }

  return (
    <aside className="workbench-panel" aria-label="Developer workbench">
      <div className="panel-head workbench-head">
        <div><span className="eyebrow">Local tools</span><h2>Workbench</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Close workbench"><Icon name="x" /></button>
      </div>
      <div className="workbench-tabs">
        {(["analysis", "preview", "utilities"] as Tool[]).map((item) => <button className={tool === item ? "active" : ""} onClick={() => setTool(item)} key={item}>{item}</button>)}
      </div>
      {tool === "analysis" && (
        <div className="workbench-content analysis-view">
          <div className="workbench-actions"><button className="primary-button" disabled={analyzing} onClick={onAnalyze}>{analyzing ? "Analyzing…" : "Analyze in worker"}</button><button className="secondary-button" onClick={onFormat}>Format file</button></div>
          {!report ? <div className="empty-tool"><Icon name="review" /><strong>Run local analysis</strong><span>No source code leaves this browser.</span></div> : <>
            <div className="metric-grid"><span><strong>{report.complexity}</strong>Complexity</span><span><strong>{report.diagnostics.length}</strong>Diagnostics</span><span><strong>{report.todos.length}</strong>TODOs</span><span><strong>{report.dependencies.length}</strong>Dependencies</span></div>
            <section><h3>Diagnostics</h3>{report.diagnostics.length ? report.diagnostics.map((item, index) => <div className={`diagnostic ${item.severity}`} key={`${item.rule}-${index}`}><strong>{item.line ? `L${item.line} · ` : ""}{item.rule}</strong><span>{item.message}</span></div>) : <p className="tool-success">No diagnostics found.</p>}</section>
            <section><h3>TODO / FIXME</h3>{report.todos.map((item) => <p key={`${item.line}-${item.text}`}>L{item.line}: {item.text}</p>)}</section>
            <section><h3>Detected dependencies</h3><div className="tag-list">{report.dependencies.map((item) => <span key={item}>{item}</span>)}</div></section>
            <section><h3>Duplicate lines</h3>{report.duplicateLines.slice(0, 100).map((item) => <p key={item.line}>Line {item.line} duplicates line {item.duplicateOf}</p>)}</section>
          </>}
        </div>
      )}
      {tool === "preview" && (
        <div className="preview-view">
          <div className="preview-toolbar">
            <button onClick={() => { setPreview(generatedPreview); setReload((value) => value + 1); }}><Icon name="refresh" />Reload</button>
            <label><input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />Auto</label>
            <label><input type="checkbox" checked={javaScript} onChange={(event) => setJavaScript(event.target.checked)} />JavaScript</label>
            <label><input type="checkbox" checked={inspect} onChange={(event) => setInspect(event.target.checked)} />Inspect DOM</label>
            <select value={viewport} onChange={(event) => setViewport(event.target.value as Viewport)}><option value="mobile">Mobile</option><option value="tablet">Tablet</option><option value="desktop">Desktop</option></select>
          </div>
          <div className={`preview-canvas ${viewport}`}>
            {specialPreview || <iframe
              key={autoRefresh ? preview : reload}
              ref={iframe}
              title="Sandboxed local project preview"
              sandbox={javaScript ? "allow-scripts" : ""}
              referrerPolicy="no-referrer"
              srcDoc={preview}
              onLoad={() => {
                if (javaScript) iframe.current?.contentWindow?.postMessage({
                  source: "p2p-preview-run",
                  code: scriptContent,
                }, "*");
              }}
            />}
          </div>
          <div className="console-panel"><div><strong>Console</strong><button onClick={() => setConsoleLines([])}>Clear</button></div><pre>{consoleLines.map((line, index) => <span className={line.type} key={index}>[{line.type}] {line.value}{"\n"}</span>)}</pre></div>
        </div>
      )}
      {tool === "utilities" && (
        <div className="workbench-content utilities-view">
          <section><h3>Base64 encoder / decoder</h3><textarea rows={4} value={base64} onChange={(event) => setBase64(event.target.value)} placeholder="Enter text or Base64…" /><div className="inline-actions"><button onClick={() => setBase64(btoa(unescape(encodeURIComponent(base64))))}>Encode</button><button onClick={() => { try { setBase64(decodeURIComponent(escape(atob(base64)))); } catch { setBase64("Invalid Base64 input"); } }}>Decode</button><button onClick={() => onApplyText(base64)}>Replace editor</button></div></section>
          <section><h3>Regular-expression tester</h3><div className="regex-input"><input value={regex} onChange={(event) => setRegex(event.target.value)} placeholder="Expression" /><input value={regexFlags} onChange={(event) => setRegexFlags(event.target.value)} aria-label="Flags" /></div><pre>{regexResult || "No matches"}</pre></section>
        </div>
      )}
    </aside>
  );
}
