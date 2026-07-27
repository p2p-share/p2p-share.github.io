import { useEffect, useRef, useState } from "react";
import type { ChatMessage, Presence } from "../types";
import { Icon } from "./Icons";

function timeLabel(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

export function ChatPanel({
  open,
  messages,
  peers,
  localPeerId,
  onSend,
  onClose,
}: {
  open: boolean;
  messages: ChatMessage[];
  peers: Presence[];
  localPeerId: string;
  onSend: (message: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, open]);

  const send = () => {
    const value = draft.trim();
    if (!value) return;
    onSend(value);
    setDraft("");
  };

  return (
    <aside className={`chat-panel ${open ? "open" : ""}`} aria-label="Group chat">
      <header className="chat-head">
        <div>
          <span className="eyebrow">Room conversation</span>
          <h2>Group chat</h2>
        </div>
        <span className="peer-count">{peers.length} {peers.length === 1 ? "peer" : "peers"}</span>
        <button className="icon-button panel-close-visible" onClick={onClose} aria-label="Close group chat">
          <Icon name="x" />
        </button>
      </header>
      <div className="peer-roster" aria-label="Connected participants">
        {peers.map((peer) => (
          <span key={peer.peerId} title={`${peer.name}${peer.local ? " (you)" : ""}`}>
            <i style={{ background: peer.color }}>{peer.name.slice(0, 1).toUpperCase()}</i>
            {peer.name}
          </span>
        ))}
      </div>
      <div className="chat-messages" aria-live="polite">
        {messages.length === 0 && (
          <div className="chat-empty">
            <span><Icon name="chat" /></span>
            <strong>Start the conversation</strong>
            <p>Messages sync directly through connected peers and stay with this room.</p>
          </div>
        )}
        {messages.map((message, index) => {
          const mine = message.peerId === localPeerId;
          const grouped = messages[index - 1]?.peerId === message.peerId;
          return (
            <article className={`chat-message ${mine ? "mine" : ""} ${grouped ? "grouped" : ""}`} key={message.id}>
              {!grouped && (
                <div className="message-meta">
                  <strong>{mine ? "You" : message.sender}</strong>
                  <time dateTime={new Date(message.sentAt).toISOString()}>{timeLabel(message.sentAt)}</time>
                </div>
              )}
              <p>{message.text}</p>
            </article>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="chat-compose">
        <textarea
          aria-label="Message the group"
          placeholder={peers.length > 1 ? "Message everyone…" : "Write a message…"}
          maxLength={2000}
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />
        <button className="send-button" disabled={!draft.trim()} onClick={send} aria-label="Send message">
          <Icon name="send" />
        </button>
      </div>
    </aside>
  );
}
