export type RoomRecord = {
  roomId: string;
  name: string;
  language: string;
  locked: boolean;
  salt?: string;
  payload: string;
  iv?: string;
  modifiedAt: number;
};

export type SharedFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  owner: string;
  ownerName?: string;
  providers?: string[];
  addedAt: number;
};

export type Presence = {
  peerId: string;
  name: string;
  color: string;
  lastSeen: number;
  local?: boolean;
};

export type ChatMessage = {
  id: string;
  peerId: string;
  sender: string;
  color: string;
  text: string;
  sentAt: number;
};

export type VersionLog = {
  id: string;
  peerId: string;
  author: string;
  color: string;
  action: "insert" | "delete";
  fromLine: number;
  toLine: number;
  text: string;
  timestamp: number;
};

export type RunResult = {
  id: string;
  peerId: string;
  author: string;
  language: string;
  status: "running" | "success" | "error" | "timeout";
  stdout: string;
  stderr: string;
  durationMs?: number;
  timestamp: number;
};

export type CodeFileMeta = {
  name: string;
  language: string;
  createdBy: string;
  createdAt: number;
  size?: number;
};

export type AccessMode = "edit" | "read";

export type ProjectManifest = {
  version: 1;
  name: string;
  description: string;
  entry?: string;
  createdAt: number;
  updatedAt: number;
};

export type Diagnostic = {
  severity: "info" | "warning" | "error";
  line?: number;
  rule: string;
  message: string;
};

export type AnalysisReport = {
  diagnostics: Diagnostic[];
  todos: Array<{ line: number; text: string }>;
  dependencies: string[];
  duplicateLines: Array<{ line: number; duplicateOf: number }>;
  complexity: number;
  lines: number;
  characters: number;
};

export type ReviewEntry = {
  id: string;
  threadId: string;
  parentId?: string;
  kind: "comment" | "feedback" | "reaction";
  author: string;
  peerId: string;
  body: string;
  line?: number;
  resolved?: boolean;
  createdAt: number;
};

export type Transfer = {
  id: string;
  fileId: string;
  name: string;
  direction: "send" | "receive";
  transferred: number;
  total: number;
  status: "running" | "done" | "failed";
  error?: string;
  startedAt?: number;
};
