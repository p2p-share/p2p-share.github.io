import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Icons";

export type Command = { id: string; label: string; detail: string; shortcut?: string; run: () => void };

export function CommandPalette({ open, commands, onClose }: { open: boolean; commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  useEffect(() => { if (open) setQuery(""); }, [open]);
  const matches = useMemo(() => commands.filter((command) =>
    `${command.label} ${command.detail}`.toLowerCase().includes(query.toLowerCase()),
  ), [commands, query]);
  if (!open) return null;
  return (
    <div className="command-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="command-search"><Icon name="search" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a command…" /></div>
        <div className="command-list">
          {matches.map((command, index) => (
            <button key={command.id} className={index === 0 ? "active" : ""} onClick={() => { command.run(); onClose(); }}>
              <span><strong>{command.label}</strong><small>{command.detail}</small></span>
              {command.shortcut && <kbd>{command.shortcut}</kbd>}
            </button>
          ))}
          {!matches.length && <p>No matching commands</p>}
        </div>
      </section>
    </div>
  );
}
