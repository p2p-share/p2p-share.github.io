import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { AccessMode } from "../types";
import { Dialog } from "./Dialog";
import { Icon } from "./Icons";

function CopyField({
  value,
  label,
  shareable = false,
}: {
  value: string;
  label: string;
  shareable?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qr, setQr] = useState("");
  useEffect(() => {
    if (!showQr || !value) return;
    let active = true;
    void QRCode.toDataURL(value, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 320,
      color: { dark: "#18181b", light: "#ffffff" },
    }).then((result) => active && setQr(result));
    return () => { active = false; };
  }, [showQr, value]);
  return (
    <div className="field-group">
      <label>{label}</label>
      <div className="copy-field">
        <textarea readOnly value={value} rows={3} />
        <button
          className="icon-button"
          aria-label={`Copy ${label}`}
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          }}
        >
          <Icon name={copied ? "check" : "copy"} />
        </button>
        {shareable && "share" in navigator && (
          <button
            className="icon-button"
            aria-label={`Share ${label}`}
            onClick={() => void navigator.share({ title: "Join my p2p-share room", url: value })}
          >
            <Icon name="share" />
          </button>
        )}
        {shareable && (
          <button className="icon-button" aria-label={`Show QR code for ${label}`} onClick={() => setShowQr((value) => !value)}>
            <Icon name="qr" />
          </button>
        )}
      </div>
      {showQr && <div className="invite-qr"><img src={qr} alt={`QR code for ${label}`} /><span>Scan with another device to open this invite.</span></div>}
    </div>
  );
}

export function ShareDialog({
  open,
  onClose,
  roomUrl,
  inviteLink,
  answer,
  joining,
  busy,
  error,
  peerCount,
  onCreateInvite,
  onAcceptAnswer,
  onJoin,
}: {
  open: boolean;
  onClose: () => void;
  roomUrl: string;
  inviteLink: string;
  answer: string;
  joining: boolean;
  busy: boolean;
  error: string;
  peerCount: number;
  onCreateInvite: (access: AccessMode) => void;
  onAcceptAnswer: (answer: string) => void;
  onJoin: () => void;
}) {
  const [answerInput, setAnswerInput] = useState("");
  const [access, setAccess] = useState<AccessMode>("edit");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={joining ? "Join this private room" : "Share this room"}
      description={
        joining
          ? "You were invited to a private, peer-to-peer workspace."
          : "Invite as many people as you need. Each person connects directly—there is no room server."
      }
      wide
    >
      {joining ? (
        <div className="dialog-body stack">
          <div className="invite-steps" aria-label="How joining works">
            <span><b>1</b> Create an answer</span>
            <span><b>2</b> Send it to the inviter</span>
            <span><b>3</b> Start collaborating</span>
          </div>
          {!answer ? (
            <button className="primary-button" disabled={busy} onClick={onJoin}>
              <Icon name="users" />
              {busy ? "Creating answer…" : "Create connection answer"}
            </button>
          ) : (
            <>
              <div className="callout success">
                <Icon name="check" />
                <div><strong>Answer ready</strong><span>Send this answer to the inviter. Keep this tab open.</span></div>
              </div>
              <CopyField label="Connection answer" value={answer} shareable />
            </>
          )}
        </div>
      ) : (
        <div className="dialog-body stack">
          <div className="callout success">
            <Icon name="users" />
            <div>
              <strong>{peerCount + 1} {peerCount ? "people are here" : "person is here"}</strong>
              <span>Create a fresh one-time invite for every new participant.</span>
            </div>
          </div>
          <CopyField label="Local recovery link" value={roomUrl} />
          <p className="field-help">
            This stable link restores data only from this browser. It does not discover peers by itself.
          </p>
          <div className="divider"><span>connect a peer</span></div>
          {!inviteLink && (
            <fieldset className="access-picker">
              <legend>Invite permission</legend>
              <label className={access === "edit" ? "active" : ""}>
                <input type="radio" name="invite-access" value="edit" checked={access === "edit"} onChange={() => setAccess("edit")} />
                <Icon name="edit" /><span><strong>Can edit</strong><small>Collaborate on code, files, chat and reviews.</small></span>
              </label>
              <label className={access === "read" ? "active" : ""}>
                <input type="radio" name="invite-access" value="read" checked={access === "read"} onChange={() => setAccess("read")} />
                <Icon name="eye" /><span><strong>Read only</strong><small>View, preview, download and join calls without editing.</small></span>
              </label>
            </fieldset>
          )}
          {!inviteLink ? (
            <button className="primary-button" disabled={busy} onClick={() => onCreateInvite(access)}>
              <Icon name="plus" />
              {busy ? "Gathering connection details…" : `Create ${access === "read" ? "read-only" : "editable"} invite`}
            </button>
          ) : (
            <CopyField label="One-time invite link" value={inviteLink} shareable />
          )}
          <div className="field-group">
            <label htmlFor="answer-input">Paste the peer’s answer</label>
            <textarea
              id="answer-input"
              rows={3}
              placeholder="Paste the answer token here"
              value={answerInput}
              onChange={(event) => setAnswerInput(event.target.value)}
            />
          </div>
          <button
            className="secondary-button"
            disabled={busy || !answerInput.trim()}
            onClick={() => onAcceptAnswer(answerInput)}
          >
            Complete connection
          </button>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </Dialog>
  );
}
