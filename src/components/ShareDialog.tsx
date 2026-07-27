import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { AccessMode, Presence } from "../types";
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
  peers,
  peerPolicies,
  canManagePeers,
  roomLocked,
  onCreateInvite,
  onResetInvite,
  onChangePeerAccess,
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
  peers: Presence[];
  peerPolicies: Map<string, AccessMode>;
  canManagePeers: boolean;
  roomLocked: boolean;
  onCreateInvite: (access: AccessMode, password?: string) => void;
  onResetInvite: () => void;
  onChangePeerAccess: (peerId: string, access: AccessMode) => void;
  onJoin: () => void;
}) {
  const [access, setAccess] = useState<AccessMode>("edit");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const create = () => {
    if (password && password.length < 8) {
      setPasswordError("Use at least 8 characters for the room password.");
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("Password confirmation does not match.");
      return;
    }
    setPasswordError("");
    onCreateInvite(access, password || undefined);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={joining ? "Join this private room" : "Invite people"}
      description={
        joining
          ? "Create a private response, send it back, and keep this tab open."
          : "Share one compact link. Peers are discovered automatically while room content remains peer-to-peer."
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
            <div><strong>{peerCount} direct {peerCount === 1 ? "route" : "routes"} active</strong><span>Large rooms relay collaboration across a bounded peer overlay.</span></div>
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
              {!roomLocked ? (
                <fieldset className="invite-password-fields">
                  <legend>Protect this room <span>optional</span></legend>
                  <label><span>Password</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => { setPassword(event.target.value); setPasswordError(""); }} placeholder="At least 8 characters" /></label>
                  <label><span>Confirm password</span><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setPasswordError(""); }} placeholder="Repeat password" /></label>
                  {passwordError && <p className="form-error" role="alert">{passwordError}</p>}
                </fieldset>
              ) : (
                <div className="callout success"><Icon name="lock" /><div><strong>Password protected</strong><span>Share the password separately from the invite link.</span></div></div>
              )}
              <button className="primary-button invite-create-button" disabled={busy} onClick={create}>
                <Icon name="plus" />
                {busy ? "Preparing secure invite…" : `Create ${access === "read" ? "read-only" : "editable"} invite`}
              </button>
            </>
          ) : (
            <>
              <div className="invite-steps" aria-label="Invitation progress">
                <span className="done"><b>1</b>Share invite</span>
                <span className="active"><b>2</b>Peer opens link</span>
                <span><b>3</b>Connect automatically</span>
              </div>
              <SignalCard label="Room invite" value={inviteLink} kind="link" qrEnabled />
              <div className="invite-waiting-row">
                <span><i />Waiting for peers to open the link</span>
                <span>{access === "read" ? "Read-only access" : "Editable access"}</span>
              </div>
              <div className="callout success">
                <Icon name="check" />
                <div><strong>No response to paste</strong><span>Firebase exchanges temporary connection details; collaboration data still travels directly through WebRTC.</span></div>
              </div>
              <button className="secondary-button invite-another-button" onClick={onResetInvite}><Icon name="plus" />Invite another peer</button>
            </>
          )}

          {canManagePeers && peers.length > 0 && (
            <section className="peer-access-manager">
              <div><strong>Connected peer access</strong><span>Changes apply immediately to each cooperative peer.</span></div>
              {peers.map((peer) => (
                <label key={peer.peerId}>
                  <span><i style={{ background: peer.color }} />{peer.name}</span>
                  <select value={peerPolicies.get(peer.peerId) || "edit"} onChange={(event) => onChangePeerAccess(peer.peerId, event.target.value as AccessMode)}>
                    <option value="edit">Can edit</option>
                    <option value="read">Read only</option>
                  </select>
                </label>
              ))}
            </section>
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
