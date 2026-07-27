import { useMemo, useRef, useState } from "react";
import type { CodeFileMeta, ProjectManifest } from "../types";
import { Icon } from "./Icons";

type FileEntry = [string, CodeFileMeta];

type TreeNode = {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  file?: FileEntry;
};

function buildTree(files: FileEntry[]) {
  const root: TreeNode = { name: "", path: "", children: new Map() };
  for (const file of files) {
    const parts = file[1].name.replaceAll("\\", "/").split("/").filter(Boolean);
    let parent = root;
    parts.forEach((part, index) => {
      const path = [...parts.slice(0, index), part].join("/");
      let node = parent.children.get(part);
      if (!node) {
        node = { name: part, path, children: new Map() };
        parent.children.set(part, node);
      }
      if (index === parts.length - 1) node.file = file;
      parent = node;
    });
  }
  return root;
}

function Tree({
  node,
  activeId,
  readOnly,
  onSelect,
  onRename,
  onDuplicate,
  onDelete,
}: {
  node: TreeNode;
  activeId: string;
  readOnly: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const children = [...node.children.values()].sort((a, b) => {
    if (Boolean(a.file) !== Boolean(b.file)) return a.file ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  return (
    <ul className="project-tree">
      {children.map((child) => child.file ? (
        <li className={child.file[0] === activeId ? "active" : ""} key={child.path}>
          <button className="project-file" onClick={() => onSelect(child.file![0])}>
            <Icon name="file" /><span>{child.name}</span>
          </button>
          {!readOnly && (
            <span className="project-row-actions">
              <button onClick={() => onRename(child.file![0])} aria-label={`Rename ${child.path}`}><Icon name="edit" /></button>
              <button onClick={() => onDuplicate(child.file![0])} aria-label={`Duplicate ${child.path}`}><Icon name="copy" /></button>
              <button onClick={() => onDelete(child.file![0])} aria-label={`Delete ${child.path}`}><Icon name="trash" /></button>
            </span>
          )}
        </li>
      ) : (
        <li className="project-folder" key={child.path}>
          <details open>
            <summary><Icon name="folder" />{child.name}</summary>
            <Tree node={child} activeId={activeId} readOnly={readOnly} onSelect={onSelect} onRename={onRename} onDuplicate={onDuplicate} onDelete={onDelete} />
          </details>
        </li>
      ))}
    </ul>
  );
}

export function ProjectPanel({
  open,
  files,
  activeId,
  manifest,
  totalSize,
  readOnly,
  warnings,
  otherTabs,
  onClose,
  onSelect,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
  onImportFiles,
  onImportZip,
  onDownloadZip,
  onManifestChange,
  onSendToTab,
}: {
  open: boolean;
  files: FileEntry[];
  activeId: string;
  manifest: ProjectManifest;
  totalSize: number;
  readOnly: boolean;
  warnings: string[];
  otherTabs: number;
  onClose: () => void;
  onSelect: (id: string) => void;
  onCreate: (path?: string) => void;
  onRename: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onImportFiles: (files: FileList) => void;
  onImportZip: (file: File) => void;
  onDownloadZip: () => void;
  onManifestChange: (manifest: ProjectManifest) => void;
  onSendToTab: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const [manifestOpen, setManifestOpen] = useState(false);
  const root = useMemo(() => buildTree(files), [files]);
  return (
    <aside className={`project-panel ${open ? "open" : ""}`} aria-label="Project explorer">
      <div className="panel-head">
        <div><span className="eyebrow">Workspace</span><h2>Project</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Close project explorer"><Icon name="x" /></button>
      </div>
      <div className="project-summary">
        <strong>{manifest.name}</strong>
        <span>{files.length.toLocaleString()} files · {(totalSize / 1024 / 1024).toFixed(2)} MB</span>
        {otherTabs > 0 && <span className="cross-tab-state">{otherTabs} other {otherTabs === 1 ? "tab" : "tabs"} synchronized</span>}
      </div>
      {!readOnly && (
        <div className="project-actions">
          <button onClick={() => onCreate()}><Icon name="plus" />File</button>
          <button onClick={() => fileInput.current?.click()}><Icon name="upload" />Files</button>
          <button onClick={() => folderInput.current?.click()}><Icon name="folder" />Folder</button>
        </div>
      )}
      <div className="project-tree-scroll">
        <Tree node={root} activeId={activeId} readOnly={readOnly} onSelect={onSelect} onRename={onRename} onDuplicate={onDuplicate} onDelete={onDelete} />
      </div>
      {warnings.length > 0 && (
        <div className="project-warnings" role="status">
          <strong>Import warnings</strong>
          {warnings.slice(-4).map((warning) => <span key={warning}>{warning}</span>)}
        </div>
      )}
      <div className="project-footer">
        <button onClick={() => setManifestOpen((value) => !value)}><Icon name="file" />Manifest</button>
        {!readOnly && <button onClick={() => zipInput.current?.click()}><Icon name="upload" />Import ZIP</button>}
        <button onClick={onDownloadZip}><Icon name="download" />Download ZIP</button>
        {otherTabs > 0 && <button onClick={onSendToTab}><Icon name="share" />Send to tab</button>}
      </div>
      {manifestOpen && (
        <div className="manifest-editor">
          <label>Project name<input value={manifest.name} disabled={readOnly} onChange={(event) => onManifestChange({ ...manifest, name: event.target.value, updatedAt: Date.now() })} /></label>
          <label>Description<textarea rows={3} value={manifest.description} disabled={readOnly} onChange={(event) => onManifestChange({ ...manifest, description: event.target.value, updatedAt: Date.now() })} /></label>
          <label>Entry file<input value={manifest.entry || ""} disabled={readOnly} placeholder="src/index.js" onChange={(event) => onManifestChange({ ...manifest, entry: event.target.value, updatedAt: Date.now() })} /></label>
        </div>
      )}
      <input ref={fileInput} hidden type="file" multiple onChange={(event) => event.target.files && onImportFiles(event.target.files)} />
      <input ref={folderInput} hidden type="file" multiple {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)} onChange={(event) => event.target.files && onImportFiles(event.target.files)} />
      <input ref={zipInput} hidden type="file" accept=".zip,application/zip" onChange={(event) => event.target.files?.[0] && onImportZip(event.target.files[0])} />
    </aside>
  );
}
