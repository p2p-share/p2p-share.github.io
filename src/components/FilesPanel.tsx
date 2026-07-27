import { useMemo, useRef, useState } from "react";
import type { SharedFile, Transfer } from "../types";
import { Icon } from "./Icons";

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function fileKind(file: SharedFile) {
  if (file.type.startsWith("image/")) return "Image";
  if (file.type.startsWith("video/")) return "Video";
  if (file.type.startsWith("audio/")) return "Audio";
  if (file.type === "application/pdf") return "PDF";
  if (/\.(?:zip|7z|rar|tar|gz)$/i.test(file.name)) return "Archive";
  if (file.type.startsWith("text/") || /\.(?:js|ts|tsx|jsx|py|java|c|cpp|md|json|css|html|sql)$/i.test(file.name)) return "Code";
  return "File";
}

function transferDetail(transfer: Transfer) {
  if (transfer.phase === "negotiating") return "Securing direct stream…";
  if (transfer.phase === "verifying") return "Verifying integrity…";
  if (!transfer.bytesPerSecond) return "";
  const remaining = Math.max(0, transfer.total - transfer.transferred);
  const seconds = remaining / transfer.bytesPerSecond;
  const eta = seconds < 60 ? `${Math.ceil(seconds)}s left` : `${Math.ceil(seconds / 60)}m left`;
  return `${formatBytes(transfer.bytesPerSecond)}/s · ${eta}`;
}

export function FilesPanel({
  open,
  files,
  localFiles,
  transfers,
  onlinePeerIds,
  currentPeerId,
  readOnly,
  onUpload,
  onDownload,
  onPreview,
  onShare,
  onRemove,
  onClearTransfers,
  onClose,
}: {
  open: boolean;
  files: SharedFile[];
  localFiles: Set<string>;
  transfers: Transfer[];
  onlinePeerIds: Set<string>;
  currentPeerId: string;
  readOnly: boolean;
  onUpload: (files: FileList) => void;
  onDownload: (file: SharedFile) => void;
  onPreview: (file: SharedFile) => void;
  onShare: (file: SharedFile) => void;
  onRemove: (file: SharedFile) => void;
  onClearTransfers: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "local" | "remote">("all");
  const [dragging, setDragging] = useState(false);
  const visibleFiles = useMemo(() => files.filter((file) => {
    if (query && !file.name.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === "local" && !localFiles.has(file.id)) return false;
    if (filter === "remote" && localFiles.has(file.id)) return false;
    return true;
  }), [files, filter, localFiles, query]);
  const activeTransfers = transfers.filter((transfer) => transfer.status === "running");
  const recentTransfers = transfers.filter((transfer) => transfer.status !== "running").slice(-5).reverse();
  const totalSize = files.reduce((total, file) => total + file.size, 0);

  return (
    <aside className={`files-panel improved ${open ? "open" : ""}`} aria-label="Shared files">
      <div className="panel-head">
        <div><span className="eyebrow">Direct peer transfer</span><h2>Shared files</h2></div>
        {!readOnly && <button className="small-button" onClick={() => inputRef.current?.click()}><Icon name="upload" />Add</button>}
        <button className="icon-button panel-close" onClick={onClose} aria-label="Close shared files"><Icon name="x" /></button>
        <input ref={inputRef} type="file" hidden multiple onChange={(event) => {
          if (event.target.files) onUpload(event.target.files);
          event.target.value = "";
        }} />
      </div>

      <div className="sharing-summary">
        <span><strong>{files.length}</strong>{files.length === 1 ? "file" : "files"}</span>
        <span><strong>{formatBytes(totalSize)}</strong>shared</span>
        <span><strong>{onlinePeerIds.size + 1}</strong>online</span>
      </div>

      {!readOnly && (
        <button
          className={`file-dropzone ${dragging ? "dragging" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDragging(false);
            if (event.dataTransfer.files.length) onUpload(event.dataTransfer.files);
          }}
        >
          <Icon name="upload" />
          <span><strong>Drop files to share</strong><small>Any type · up to 1 GB each · direct to peers</small></span>
        </button>
      )}

      <div className="file-browser-tools">
        <label><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search shared files…" /></label>
        <div role="group" aria-label="Filter shared files">
          {(["all", "local", "remote"] as const).map((value) => (
            <button className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)}>{value}</button>
          ))}
        </div>
      </div>

      <div className="file-list">
        {visibleFiles.length === 0 && (
          <div className="empty-files">
            <span className="empty-icon"><Icon name={query || filter !== "all" ? "search" : "folder"} /></span>
            <strong>{query || filter !== "all" ? "No matching files" : "Nothing shared yet"}</strong>
            <span>{query || filter !== "all" ? "Try another search or filter." : "Upload files here and every connected peer can request them directly."}</span>
          </div>
        )}
        {visibleFiles.map((file) => {
          const transfer = [...transfers].reverse().find((item) => item.fileId === file.id);
          const providers = new Set(file.providers?.length ? file.providers : [file.owner]);
          const providerOnline = localFiles.has(file.id) || [...providers].some((id) => onlinePeerIds.has(id));
          const canRemove = !readOnly && (file.owner === currentPeerId || localFiles.has(file.id));
          const percent = transfer?.total ? Math.min(100, transfer.transferred / transfer.total * 100) : 0;
          return (
            <article className="file-row enhanced" key={file.id}>
              <button className="file-main" onClick={() => localFiles.has(file.id) ? onPreview(file) : onDownload(file)} disabled={!providerOnline || transfer?.status === "running"}>
                <span className={`file-icon ${fileKind(file).toLowerCase()}`}><Icon name="file" /></span>
                <span className="file-details">
                  <strong title={file.name}>{file.name}</strong>
                  <span>{fileKind(file)} · {formatBytes(file.size)} · {file.ownerName || "Peer"}</span>
                  <span className={`availability ${providerOnline ? "online" : "offline"}`}>
                    <i />{localFiles.has(file.id) ? "On this device" : providerOnline ? `${[...providers].filter((id) => onlinePeerIds.has(id)).length} provider online` : "Provider offline"}
                  </span>
                </span>
              </button>
              <span className="file-actions">
                {localFiles.has(file.id) && <button onClick={() => onPreview(file)} aria-label={`Preview ${file.name}`} title="Preview"><Icon name="eye" /></button>}
                <button onClick={() => onShare(file)} aria-label={`Share ${file.name}`} title="Share file invite"><Icon name="share" /></button>
                <button disabled={!providerOnline || transfer?.status === "running"} onClick={() => onDownload(file)} aria-label={localFiles.has(file.id) ? `Download ${file.name}` : `Request ${file.name}`} title={transfer?.status === "failed" ? "Retry transfer" : "Download"}><Icon name={transfer?.status === "failed" ? "refresh" : "download"} /></button>
                {canRemove && <button className="danger" onClick={() => onRemove(file)} aria-label={`Remove ${file.name}`} title="Remove from room"><Icon name="trash" /></button>}
              </span>
              {transfer && (
                <div className={`file-transfer-inline ${transfer.status}`}>
                  <span>{transfer.status === "running" ? `${transfer.direction === "send" ? "Sending" : "Receiving"} ${Math.round(percent)}%${transferDetail(transfer) ? ` · ${transferDetail(transfer)}` : ""}` : transfer.status === "done" ? "Transfer complete · encrypted and verified" : transfer.error || "Transfer failed"}</span>
                  {transfer.status === "running" && <strong>{formatBytes(transfer.transferred)} / {formatBytes(transfer.total)}</strong>}
                  <div><i style={{ width: `${transfer.status === "done" ? 100 : percent}%` }} /></div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {(activeTransfers.length > 0 || recentTransfers.length > 0) && (
        <div className="transfer-tray">
          <div><strong>{activeTransfers.length ? `${activeTransfers.length} simultaneous direct stream${activeTransfers.length === 1 ? "" : "s"}` : "Recent transfers"}</strong>{!activeTransfers.length && <button onClick={onClearTransfers}>Clear</button>}</div>
          {activeTransfers.map((transfer) => <span key={transfer.id}><Icon name={transfer.direction === "send" ? "upload" : "download"} />{transfer.name}<b>{transfer.phase === "verifying" ? "verifying" : `${Math.round(transfer.transferred / transfer.total * 100)}%`}</b></span>)}
          {!activeTransfers.length && recentTransfers.slice(0, 2).map((transfer) => <span className={transfer.status} key={transfer.id}><Icon name={transfer.status === "done" ? "check" : "refresh"} />{transfer.name}<b>{transfer.status}</b></span>)}
        </div>
      )}
      <div className="quota-note"><Icon name="shield" />Direct binary stream · AES-256-GCM encrypted · SHA-256 verified · no server upload.</div>
    </aside>
  );
}
