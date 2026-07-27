import type { VersionLog } from "../types";
import { Icon } from "./Icons";

export function ActivityPanel({
  open,
  logs,
  onClose,
  onClear,
}: {
  open: boolean;
  logs: VersionLog[];
  onClose: () => void;
  onClear: () => void;
}) {
  return (
    <aside className={`activity-panel ${open ? "open" : ""}`} aria-label="Version history">
      <header className="panel-heading">
        <div><span className="eyebrow">Hidden by default</span><h2>Version logs</h2></div>
        <button className="text-button" disabled={!logs.length} onClick={onClear}>Clear</button>
        <button className="icon-button" onClick={onClose} aria-label="Close version logs"><Icon name="x" /></button>
      </header>
      <div className="activity-list">
        {!logs.length && (
          <div className="panel-empty"><Icon name="history" /><strong>No edits recorded yet</strong><p>New line-level edits will appear here with attribution.</p></div>
        )}
        {[...logs].reverse().map((log) => (
          <article className="activity-entry" key={log.id}>
            <div className="activity-meta">
              <i style={{ background: log.color }}>{log.author.slice(0, 1).toUpperCase()}</i>
              <strong>{log.author}</strong>
              <time>{new Date(log.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
            </div>
            <p><b>{log.action === "insert" ? "Added" : "Removed"}</b> {log.fromLine === log.toLine ? `line ${log.fromLine}` : `lines ${log.fromLine}–${log.toLine}`}</p>
            <pre>{log.text || "(empty line)"}</pre>
          </article>
        ))}
      </div>
    </aside>
  );
}
