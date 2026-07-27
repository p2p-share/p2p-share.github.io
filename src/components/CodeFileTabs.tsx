import type { CodeFileMeta } from "../types";
import { Icon } from "./Icons";

export function CodeFileTabs({
  files,
  activeId,
  onSelect,
  onAdd,
  onRemove,
  readOnly = false,
}: {
  files: Array<[string, CodeFileMeta]>;
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="code-file-tabs" role="tablist" aria-label="Collaborative files">
      {files.map(([id, file]) => (
        <div className={id === activeId ? "active" : ""} key={id}>
          <button role="tab" aria-selected={id === activeId} onClick={() => onSelect(id)}>
            <Icon name="file" /><span>{file.name || "untitled"}</span>
          </button>
          {!readOnly && files.length > 1 && <button className="tab-close" onClick={() => onRemove(id)} aria-label={`Close ${file.name}`}><Icon name="x" /></button>}
        </div>
      ))}
      {!readOnly && <button className="add-file-tab" onClick={onAdd} aria-label="Add collaborative file"><Icon name="plus" /></button>}
    </div>
  );
}
