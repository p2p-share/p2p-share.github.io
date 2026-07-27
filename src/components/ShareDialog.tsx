import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { AccessMode } from "../types";
import { Dialog } from "./Dialog";
import { Icon } from "./Icons";

type SignalKind = "link" | "response";

function SignalCard({
  value,
  label,
  kind,
  qrEnabled = false,
}: {
  value: string;
  label: string;
  kind: SignalKind;
  qrEnabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [details, setDetails] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const fieldId = `signal-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  useEffect(() => {
    setCopied(false);
    setDetails(false);
    setShowQr(false);
    setQr("");
    setError("");
  }, [value]);

  useEffect(() => {
    if (!showQr || !value || qr) return;
    let active = true;
    setError("");
    void QRCode.toDataURL(value, {
      errorCorrectionLevel: "L",
      margin: 2,
      width: 320,
      color: { dark: "#18181b", light: "#ffffff" },
    })
      .then((result) => { if (active) setQr(result); })
      .catch(() => { if (active) setError("This invite is too dense for a reliable QR code. Use Copy or Share instead."); });
    return () => { active = false; };
  }, [qr, showQr, value]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setError("");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setDetails(true);
      setError("Clipboard access was blocked. Select the connection data below and copy it manually.");
    }
  };

  const share = async () => {
    try {
      if (kind === "link") {
        await navigator.share({ title: "Join my p2p-share room", text: "Open this one-time p2p-share invitation.", url: value });
      } else {
        await navigator.share({ title: "p2p-share connection response", text: value });
      }
    } catch (shareError) {
      if ((shareError as DOMException).name !== "AbortError") setError("Your device could not open the share menu.");
    }
  };

  return (
    <section className="signal-card" aria-label={label}>
      <div className="signal-card-summary">
        <span className="signal-card-icon"><Icon name={kind === "link" ? "share" : "check"} /></span>
        <div>
          <strong>{label}</strong>
          <span>
            {kind === "link" ? "One-time connection link" : "Private connection response"}
            {" · "}
            {Math.max(1, Math.ceil(new Blob([value]).size / 1024))} KB
          </span>
        </div>
        <span className="signal-ready"><i />Ready</span>
      </div>
      <div className="signal-actions">
        <button className="primary-button" onClick={() => void copy()}>
          <Icon name={copied ? "check" : "copy"} />
          {copied ? "Copied" : kind === "link" ? "Copy invite" : "Copy response"}
        </button>
        {"share" in navigator && (
          <button className="secondary-button" onClick={() => void share()}>
            <Icon name="share" />Share
          </button>
        )}
        {qrEnabled && (
          <button className="secondary-button" aria-expanded={showQr} onClick={() => setShowQr((current) => !current)}>
            <Icon name="qr" />{showQr ? "Hide QR" : "Show QR"}
          </button>
        )}
        <button className="text-button signal-details-toggle" aria-expanded={details} onClick={() => setDetails((current) => !current)}>
          {details ? "Hide details" : "Advanced"}
        </button>
      </div>
      {showQr && qr && (
        <div className="invite-qr">
          <img src={qr} alt={`QR code for ${label}`} />
          <span>Scan this on the invited device. The connection data stays inside the QR code.</span>
        </div>
      )}
      {details && (
        <div className="signal-details">
          <label htmlFor={fieldId}>Full connection data</label>
          <textarea id={fieldId} readOnly value={value} rows={3} onFocus={(event) => event.currentTarget.select()} />
        </div>
      )}
      {error && <p className="signal-error" role="alert">{error}</p>}
    </section>
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
  const [pasteError, setPasteError] = useState("");

  const pasteAnswer = async () => {
    try {
      const value = await navigator.clipboard.readText();
      if (!value.trim()) throw new Error("Clipboard is empty.");
      setAnswerInput(value.trim());
      setPasteError("");
    } catch (pasteFailure) {
      setPasteError(pasteFailure instanceof Error ? pasteFailure.message : "Clipboard access was blocked.");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={joining ? "Join this private room" : "Invite people"}
      description={
        joining
          ? "Create a private response, send it back, and keep this tab open."
          : "Create one invite per person. No account, signaling server, or stored room directory is used."
      }
      wide
    >
      {joining ? (
        <div className="dialog-body stack">
          <div className="invite-steps" aria-label="How joining works">
            <span className={answer ? "done" : "active"}><b>1</b>Create response</span>
            <span className={answer ? "active" : ""}><b>2</b>Copy or share it</span>
            <span><b>3</b>Wait for connection</span>
          </div>
          {!answer ? (
            <div className="invite-primary-action">
              <span className="invite-action-icon"><Icon name="users" /></span>
              <div><strong>Connect to the inviter</strong><p>Your browser creates the response locally. Nothing is uploaded.</p></div>
              <button className="primary-button" disabled={busy} onClick={onJoin}>
                {busy ? "Preparing…" : "Create response"}
              </button>
            </div>
          ) : (
            <>
              <SignalCard label="Connection response" value={answer} kind="response" />
              <div className="callout success">
                <Icon name="check" />
                <div><strong>Keep this tab open</strong><span>The inviter will complete the connection after receiving your response.</span></div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="dialog-body stack">
          <div className="invite-room-status">
            <span className="signal-card-icon"><Icon name="users" /></span>
            <div><strong>{peerCount + 1} {peerCount ? "people connected" : "person in this room"}</strong><span>Each new person needs their own one-time invite.</span></div>
          </div>

          {!inviteLink ? (
            <>
              <fieldset className="access-picker">
                <legend>What can this person do?</legend>
                <label className={access === "edit" ? "active" : ""}>
                  <input type="radio" name="invite-access" value="edit" checked={access === "edit"} onChange={() => setAccess("edit")} />
                  <Icon name="edit" /><span><strong>Can edit</strong><small>Code, files, chat and reviews.</small></span>
                </label>
                <label className={access === "read" ? "active" : ""}>
                  <input type="radio" name="invite-access" value="read" checked={access === "read"} onChange={() => setAccess("read")} />
                  <Icon name="eye" /><span><strong>Read only</strong><small>View, preview, download and calls.</small></span>
                </label>
              </fieldset>
              <button className="primary-button invite-create-button" disabled={busy} onClick={() => onCreateInvite(access)}>
                <Icon name="plus" />
                {busy ? "Preparing secure invite…" : `Create ${access === "read" ? "read-only" : "editable"} invite`}
              </button>
            </>
          ) : (
            <>
              <div className="invite-steps" aria-label="Invitation progress">
                <span className="done"><b>1</b>Share invite</span>
                <span className={answerInput ? "done" : "active"}><b>2</b>Receive response</span>
                <span className={answerInput ? "active" : ""}><b>3</b>Connect</span>
              </div>
              <SignalCard label="One-time invite" value={inviteLink} kind="link" qrEnabled />
              <div className="invite-waiting-row">
                <span><i />Waiting for this person’s response</span>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setAnswerInput("");
                    onCreateInvite(access);
                  }}
                >
                  Create a fresh invite
                </button>
              </div>
              <div className="response-paste">
                <div>
                  <label htmlFor="answer-input">Peer response</label>
                  <span>Paste the response they send back.</span>
                </div>
                <button className="secondary-button" type="button" onClick={() => void pasteAnswer()}>
                  <Icon name="copy" />Paste from clipboard
                </button>
                <textarea
                  id="answer-input"
                  rows={1}
                  placeholder="Paste connection response"
                  value={answerInput}
                  onChange={(event) => {
                    setAnswerInput(event.target.value);
                    setPasteError("");
                  }}
                />
                <button
                  className="primary-button"
                  disabled={busy || !answerInput.trim()}
                  onClick={() => onAcceptAnswer(answerInput.trim())}
                >
                  <Icon name="users" />{busy ? "Connecting…" : "Complete connection"}
                </button>
                {pasteError && <p className="signal-error" role="alert">{pasteError}</p>}
              </div>
            </>
          )}

          <details className="recovery-details">
            <summary>Local recovery link</summary>
            <p>This reopens locally cached data on this browser. It cannot discover peers.</p>
            <SignalCard label="Local recovery link" value={roomUrl} kind="link" />
          </details>
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </Dialog>
  );
}
