import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icons";

export function LanguagePicker({
  value,
  languages,
  onChange,
  disabled = false,
}: {
  value: string;
  languages: ReadonlyArray<readonly [string, string]>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const selected = languages.find(([id]) => id === value)?.[1] || "Plain text";
  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? languages.filter(([id, label]) => `${label} ${id}`.toLowerCase().includes(normalized))
      : languages;
  }, [languages, query]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  useEffect(() => {
    if (open) window.setTimeout(() => search.current?.focus(), 0);
    else setQuery("");
  }, [open]);

  return (
    <div className="language-picker" ref={root}>
      <button
        className="language-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected}</span><Icon name="chevron" />
      </button>
      {open && (
        <div className="language-menu">
          <label>
            <span className="sr-only">Search languages and formats</span>
            <Icon name="search" />
            <input
              ref={search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpen(false);
                if (event.key === "Enter" && matches[0]) {
                  onChange(matches[0][0]);
                  setOpen(false);
                }
              }}
              placeholder="Search languages…"
            />
          </label>
          <div className="language-options" role="listbox" aria-label="Programming languages">
            {matches.map(([id, label]) => (
              <button
                type="button"
                role="option"
                aria-selected={id === value}
                className={id === value ? "selected" : ""}
                key={id}
                onClick={() => { onChange(id); setOpen(false); }}
              >
                <span>{label}</span>{id === value && <Icon name="check" />}
              </button>
            ))}
            {!matches.length && <p>No matching language</p>}
          </div>
        </div>
      )}
    </div>
  );
}
