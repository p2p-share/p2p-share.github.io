import type { ReactNode } from "react";
import { Icon } from "./Icons";

export function Dialog({
  open,
  title,
  description,
  children,
  onClose,
  closeable = true,
  wide = false,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose?: () => void;
  closeable?: boolean;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={closeable ? onClose : undefined}>
      <section
        className={`dialog ${wide ? "dialog-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <div>
            <h2 id="dialog-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          {closeable && (
            <button className="icon-button" onClick={onClose} aria-label="Close dialog">
              <Icon name="x" />
            </button>
          )}
        </div>
        {children}
      </section>
    </div>
  );
}
