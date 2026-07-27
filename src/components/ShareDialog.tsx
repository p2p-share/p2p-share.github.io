import { useState } from "react";
import { Dialog } from "./Dialog";
import { Icon } from "./Icons";

function CopyField({ value, label }: { value: string; label: string }) {
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
          ? "Create an answer, then send it back to the person who invited you."
          : "Direct peer pairing uses no signaling service. Each new peer needs one invite and one answer."
      }
      wide
    >
      {joining ? (
        <div className="dialog-body stack">
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
              <CopyField label="Connection answer" value={answer} />
            </>
          )}
        </div>
      ) : (
        <div className="dialog-body stack">
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
            <CopyField label="One-time invite link" value={inviteLink} />
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
