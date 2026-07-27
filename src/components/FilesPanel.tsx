import { useRef } from "react";
import type { SharedFile, Transfer } from "../types";
import { Icon } from "./Icons";

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function FilesPanel({
  open,
  files,
  localFiles,
  transfers,
  onUpload,
  onDownload,
  onRemove,
  onClose,
}: {
  open: boolean;
  files: SharedFile[];
  localFiles: Set<string>;
  transfers: Transfer[];
  onUpload: (files: FileList) => void;
  onDownload: (file: SharedFile) => void;
  onRemove: (file: SharedFile) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <aside className={`files-panel ${open ? "open" : ""}`} aria-label="Shared files">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Room storage</span>
          <h2>Shared files</h2>
        </div>
        <button className="small-button" onClick={() => inputRef.current?.click()}>
          <Icon name="upload" />
          Add
        </button>
        <button className="icon-button panel-close" onClick={onClose} aria-label="Close shared files">
          <Icon name="x" />
        </button>
        <input
          ref={inputRef}
          type="file"
          hidden
          multiple
          onChange={(event) => event.target.files && onUpload(event.target.files)}
        />
      </div>
      <p className="panel-note">Files travel directly between open peers. Maximum 1 GB per file.</p>
      <div className="file-list">
        {files.length === 0 && (
          <div className="empty-files">
            <span className="empty-icon"><Icon name="folder" /></span>
            <strong>No shared files</strong>
            <span>Drop code, archives, images, or any other file type here.</span>
          </div>
        )}
        {files.map((file) => {
          const transfer = transfers.find((item) => item.fileId === file.id && item.status === "running");
          return (
            <article className="file-row" key={file.id}>
              <span className="file-icon"><Icon name="file" /></span>
              <div className="file-details">
                <strong title={file.name}>{file.name}</strong>
                <span>{formatBytes(file.size)} · {localFiles.has(file.id) ? "available locally" : "from peer"}</span>
                {transfer && (
                  <div className="progress">
                    <span style={{ width: `${Math.min(100, transfer.transferred / transfer.total * 100)}%` }} />
                  </div>
                )}
              </div>
              <button
                className="icon-button"
                onClick={() => onDownload(file)}
                aria-label={localFiles.has(file.id) ? `Download ${file.name}` : `Request ${file.name}`}
              >
                <Icon name="download" />
              </button>
              <button className="icon-button danger" onClick={() => onRemove(file)} aria-label={`Remove ${file.name}`}>
                <Icon name="trash" />
              </button>
            </article>
          );
        })}
      </div>
      <div className="quota-note"><Icon name="shield" />Browser storage quotas still apply to local recovery copies.</div>
    </aside>
  );
}
