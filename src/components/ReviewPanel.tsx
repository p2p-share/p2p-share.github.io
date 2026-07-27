import { useMemo, useState } from "react";
import type { Presence, ReviewEntry } from "../types";
import { Icon } from "./Icons";

export function ReviewPanel({
  open,
  entries,
  peers,
  onAdd,
  onReact,
  onClose,
}: {
  open: boolean;
  entries: ReviewEntry[];
  peers: Presence[];
  onAdd: (body: string, kind: "comment" | "feedback", line?: number, parent?: ReviewEntry) => void;
  onReact: (target: ReviewEntry, emoji: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [line, setLine] = useState("");
  const [replying, setReplying] = useState<ReviewEntry>();
  const threads = entries.filter((entry) => !entry.parentId && entry.kind !== "reaction");
  const byParent = useMemo(() => {
    const groups = new Map<string, ReviewEntry[]>();
    for (const entry of entries) {
      if (!entry.parentId) continue;
      groups.set(entry.parentId, [...(groups.get(entry.parentId) || []), entry]);
    }
    return groups;
  }, [entries]);
  const submit = (kind: "comment" | "feedback") => {
    if (!draft.trim()) return;
    onAdd(draft.trim(), kind, line ? Number(line) : undefined, replying);
    setDraft("");
    setLine("");
    setReplying(undefined);
  };
  return (
    <aside className={`review-panel ${open ? "open" : ""}`} aria-label="Code review discussions">
      <header className="panel-heading"><div><span className="eyebrow">Collaborative review</span><h2>Discussions</h2></div><button className="icon-button" onClick={onClose} aria-label="Close discussions"><Icon name="x" /></button></header>
      <div className="review-compose">
        {replying && <span className="replying">Replying to {replying.author}<button onClick={() => setReplying(undefined)}>Cancel</button></span>}
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Comment or mention a peer with @name…" rows={3} />
        <div className="mention-row">{peers.slice(0, 6).map((peer) => <button key={peer.peerId} onClick={() => setDraft((value) => `${value}${value ? " " : ""}@${peer.name.replace(/\s+/g, "")} `)}>@{peer.name}</button>)}</div>
        <div><input aria-label="Related line number" type="number" min="1" value={line} onChange={(event) => setLine(event.target.value)} placeholder="Line" /><button className="secondary-button" onClick={() => submit("comment")}>Comment</button><button className="primary-button" onClick={() => submit("feedback")}><Icon name="review" /> Request review</button></div>
      </div>
      <div className="review-list">
        {!threads.length && <div className="panel-empty"><Icon name="review" /><strong>No discussions yet</strong><p>Comment on a line, mention peers, or request feedback.</p></div>}
        {threads.map((thread) => {
          const children = byParent.get(thread.id) || [];
          const replies = children.filter((entry) => entry.kind !== "reaction");
          const reactions = children.filter((entry) => entry.kind === "reaction");
          return <article className="review-thread" key={thread.id}>
            <header><strong>{thread.author}</strong><time>{new Date(thread.createdAt).toLocaleString()}</time>{thread.kind === "feedback" && <b>Review requested</b>}</header>
            {thread.line && <span className="line-link">Line {thread.line}</span>}
            <p>{thread.body}</p>
            {replies.map((reply) => <div className="review-reply" key={reply.id}><strong>{reply.author}</strong><p>{reply.body}</p></div>)}
            <footer>
              {["👍", "❤️", "🚀"].map((emoji) => <button key={emoji} onClick={() => onReact(thread, emoji)}>{emoji} {reactions.filter((entry) => entry.body === emoji).length || ""}</button>)}
              <button onClick={() => setReplying(thread)}>Reply</button>
            </footer>
          </article>;
        })}
      </div>
    </aside>
  );
}
