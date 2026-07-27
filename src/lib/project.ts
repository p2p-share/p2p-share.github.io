import JSZip from "jszip";
import type * as Y from "yjs";
import { languageFromFilename } from "./document";
import type { CodeFileMeta, ProjectManifest } from "../types";

export const MAX_PROJECT_FILE_SIZE = 256 * 1024 * 1024;
export const MAX_PROJECT_SIZE = 512 * 1024 * 1024;
export const MAX_PROJECT_FILES = 2_000;
export const MANIFEST_FILE = "p2p-share.project.json";

export type ProjectFile = { id: string; name: string; content: string; language: string };
export type ImportCandidate = { name: string; content: string; language: string };

export function sanitizeProjectPath(value: string) {
  const parts = value.replaceAll("\\", "/").split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .map((part) => part.replace(/[<>:"|?*]/g, "-").split("")
      .map((character) => character.charCodeAt(0) < 32 ? "-" : character)
      .join(""));
  return parts.join("/").slice(0, 512) || "untitled.txt";
}

export function isProbablyBinary(bytes: Uint8Array) {
  const sample = bytes.subarray(0, Math.min(bytes.length, 8_192));
  if (sample.includes(0)) return true;
  let suspicious = 0;
  for (const byte of sample) {
    if (byte < 7 || (byte > 13 && byte < 32)) suspicious += 1;
  }
  return sample.length > 0 && suspicious / sample.length > 0.08;
}

export function projectSize(files: ProjectFile[]) {
  return files.reduce((total, file) => total + new Blob([file.content]).size, 0);
}

export async function readTextProjectFile(file: File): Promise<ImportCandidate> {
  if (file.size > MAX_PROJECT_FILE_SIZE) throw new Error(`${file.name} exceeds the 256 MB editor limit.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (isProbablyBinary(bytes)) throw new Error(`${file.name} appears to be binary and was not imported.`);
  return {
    name: sanitizeProjectPath(file.webkitRelativePath || file.name),
    content: new TextDecoder("utf-8", { fatal: false }).decode(bytes),
    language: languageFromFilename(file.name),
  };
}

export async function importProjectZip(file: File) {
  if (file.size > MAX_PROJECT_SIZE) throw new Error("ZIP exceeds the 512 MB project limit.");
  const archive = await JSZip.loadAsync(file);
  const entries = Object.values(archive.files).filter((entry) => !entry.dir);
  if (entries.length > MAX_PROJECT_FILES) throw new Error(`ZIP contains more than ${MAX_PROJECT_FILES} files.`);
  const files: ImportCandidate[] = [];
  const warnings: string[] = [];
  let manifest: ProjectManifest | undefined;
  let total = 0;
  for (const entry of entries) {
    const bytes = await entry.async("uint8array");
    total += bytes.byteLength;
    if (total > MAX_PROJECT_SIZE) throw new Error("Uncompressed project exceeds the 512 MB limit.");
    const name = sanitizeProjectPath(entry.name);
    if (name === MANIFEST_FILE) {
      try {
        manifest = JSON.parse(new TextDecoder().decode(bytes)) as ProjectManifest;
      } catch {
        warnings.push("The project manifest is not valid JSON.");
      }
      continue;
    }
    if (bytes.byteLength > MAX_PROJECT_FILE_SIZE || isProbablyBinary(bytes)) {
      warnings.push(`${name} was skipped because it is binary or too large.`);
      continue;
    }
    files.push({
      name,
      content: new TextDecoder("utf-8", { fatal: false }).decode(bytes),
      language: languageFromFilename(name),
    });
  }
  return { files, warnings, manifest };
}

export async function downloadProjectZip(files: ProjectFile[], manifest: ProjectManifest) {
  const archive = new JSZip();
  for (const file of files) archive.file(sanitizeProjectPath(file.name), file.content);
  archive.file(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  const blob = await archive.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    streamFiles: true,
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeProjectPath(manifest.name).replaceAll("/", "-") || "p2p-share-project"}.zip`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function materializeProject(codeFiles: Y.Map<Y.Text>, metadata: Y.Map<CodeFileMeta>): ProjectFile[] {
  return [...metadata.entries()].flatMap(([id, meta]) => {
    const text = codeFiles.get(id);
    return text ? [{ id, name: meta.name, language: meta.language, content: text.toString() }] : [];
  });
}
