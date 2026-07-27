import { useEffect, useState } from "react";
import type { SharedFile } from "../types";
import { Dialog } from "./Dialog";
import { Icon } from "./Icons";

function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB"];
  const index = bytes ? Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1) : 0;
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function FilePreviewDialog({
  file,
  blob,
  onClose,
  onDownload,
}: {
  file?: SharedFile;
  blob?: Blob;
  onClose: () => void;
  onDownload: () => void;
}) {
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!blob || !file) return;
    const nextUrl = URL.createObjectURL(blob);
    setUrl(nextUrl);
    setText("");
    setError("");
    const textual = file.type.startsWith("text/")
      || /\.(?:md|txt|log|json|csv|xml|svg|js|ts|tsx|jsx|css|html|py|java|c|cpp|h|sql|yaml|yml|toml)$/i.test(file.name);
    if (textual && blob.size <= 5 * 1024 * 1024) {
      void blob.text().then((value) => setText(value.slice(0, 500_000))).catch(() => setError("This text preview could not be decoded."));
    }
    return () => URL.revokeObjectURL(nextUrl);
  }, [blob, file]);
  const type = file?.type || "";
  return (
    <Dialog
      open={Boolean(file && blob)}
      onClose={onClose}
      title={file?.name || "File preview"}
      description={file ? `${formatBytes(file.size)} · ${file.type || "Unknown file type"}` : ""}
      wide
    >
      <div className="dialog-body file-preview-body">
        {type.startsWith("image/") && <img src={url} alt={file?.name || "Shared file"} />}
        {type.startsWith("video/") && <video src={url} controls />}
        {type.startsWith("audio/") && <audio src={url} controls />}
        {type === "application/pdf" && <iframe src={url} title={file?.name || "PDF preview"} sandbox="" />}
        {text && <pre>{text}</pre>}
        {!text && !type.match(/^(?:image|video|audio)\//) && type !== "application/pdf" && (
          <div className="file-preview-unavailable">
            <Icon name="file" />
            <strong>Preview unavailable</strong>
            <span>Download this file to open it with an application on your device.</span>
          </div>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="dialog-actions">
          <button className="secondary-button" onClick={onClose}>Close</button>
          <button className="primary-button" onClick={onDownload}><Icon name="download" />Download</button>
        </div>
      </div>
    </Dialog>
  );
}
