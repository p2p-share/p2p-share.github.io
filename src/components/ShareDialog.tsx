import { useState } from "react";
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
      </div>
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
  onCreateInvite: () => void;
  onAcceptAnswer: (answer: string) => void;
  onJoin: () => void;
}) {
  const [answerInput, setAnswerInput] = useState("");
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
          {!inviteLink ? (
            <button className="primary-button" disabled={busy} onClick={onCreateInvite}>
              <Icon name="plus" />
              {busy ? "Gathering connection details…" : "Create one-time invite"}
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
