import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import * as Y from "yjs";
import { ActivityPanel } from "./components/ActivityPanel";
import { CallPanel } from "./components/CallPanel";
import { ChatPanel } from "./components/ChatPanel";
import { CodeEditor, languages } from "./components/CodeEditor";
import { CodeFileTabs } from "./components/CodeFileTabs";
import { Dialog } from "./components/Dialog";
import { FilesPanel } from "./components/FilesPanel";
import { FilePreviewDialog } from "./components/FilePreviewDialog";
import { Icon } from "./components/Icons";
import { LanguagePicker } from "./components/LanguagePicker";
import { ShareDialog } from "./components/ShareDialog";
import { RunnerPanel } from "./components/RunnerPanel";
import { ReviewPanel } from "./components/ReviewPanel";
import { PublishPanel } from "./components/PublishPanel";
import { ProjectPanel } from "./components/ProjectPanel";
import { WorkbenchPanel } from "./components/WorkbenchPanel";
import { CommandPalette, type Command } from "./components/CommandPalette";
import { analyzeCode, formatCode } from "./lib/analysis";
import { CrossTabCoordinator, mergeRecentProject } from "./lib/crossTab";
import { createSalt, decryptBytes, deriveRoomKey, encryptBytes } from "./lib/crypto";
import { deleteFile, deleteRoom, finishChunks, getFile, getRoom, putChunk, putFile, putRoom } from "./lib/db";
import { detectLanguage, documentFilename, documentStats, downloadText, languageFromFilename } from "./lib/document";
import { streamUtf8Blob, type StreamImportProgress } from "./lib/largeImport";
import {
  downloadProjectZip,
  importProjectZip,
  isProbablyBinary,
  materializeProject,
  MAX_PROJECT_FILES,
  MAX_PROJECT_SIZE,
  readTextProjectFile,
  sanitizeProjectPath,
  type ImportCandidate,
} from "./lib/project";
import { base64ToBytes, bytesToBase64 } from "./lib/encoding";
import { inspectInvite, PeerMesh } from "./lib/mesh";
import { canRunLocally, emptyRunResult, runLocalCode, runWithJudge0 } from "./lib/runner";
import type { InviteToken } from "./lib/signaling";
import type { AccessMode, AnalysisReport, ChatMessage, CodeFileMeta, Presence, ProjectManifest, ReviewEntry, RoomRecord, RunResult, SharedFile, Transfer, VersionLog } from "./types";

type Session = {
  roomId: string;
  doc: Y.Doc;
  text: Y.Text;
  meta: Y.Map<unknown>;
  files: Y.Map<SharedFile>;
  messages: Y.Array<ChatMessage>;
  logs: Y.Array<VersionLog>;
  runner: Y.Map<unknown>;
  codeFiles: Y.Map<Y.Text>;
  codeFileMeta: Y.Map<CodeFileMeta>;
  reviews: Y.Array<ReviewEntry>;
  description: Y.Text;
  mesh: PeerMesh;
  key?: CryptoKey;
  locked: boolean;
  salt?: string;
  tabs: CrossTabCoordinator;
};

type BootState = {
  roomId: string;
  record?: RoomRecord;
  invite?: InviteToken;
  inviteToken?: string;
};

type IncomingSink = {
  file: SharedFile;
  transferId: string;
  writable?: any;
  chain: Promise<void>;
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type WorkspacePanel = "project" | "files" | "workbench" | "runner" | "activity" | "review" | "chat" | "publish";

const MAX_FILE_SIZE = 1024 ** 3;
const MAX_EDITOR_FILE_SIZE = 512 * 1024 ** 2;
const LARGE_DOCUMENT_THRESHOLD = 5 * 1024 ** 2;
const FILE_CHUNK_SIZE = 48 * 1024;
const STREAM_IMPORT_ORIGIN = "stream-import";
const palette = ["#7c5cff", "#12b981", "#f59f0b", "#ee5d7b", "#2e90fa", "#a855f7"];

function newRoomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("").slice(0, 14);
}

function parseHash() {
  return new URLSearchParams(location.hash.replace(/^#/, ""));
}

function roomUrl(roomId: string) {
  return `${location.origin}${location.pathname}#room=${encodeURIComponent(roomId)}`;
}

function randomGuestName() {
  const current = sessionStorage.getItem("sharecode:guest-name");
  if (current) return current;
  const value = `Guest ${Math.floor(100 + Math.random() * 900)}`;
  sessionStorage.setItem("sharecode:guest-name", value);
  return value;
}

function updateTransfer(
  setter: React.Dispatch<React.SetStateAction<Transfer[]>>,
  id: string,
  changes: Partial<Transfer>,
) {
  setter((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)));
}

async function droppedProjectFiles(items: DataTransferItemList): Promise<File[]> {
  const files: File[] = [];
  async function walk(entry: any, prefix = ""): Promise<void> {
    if (entry?.isFile) {
      const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
      Object.defineProperty(file, "webkitRelativePath", { configurable: true, value: `${prefix}${file.name}` });
      files.push(file);
      return;
    }
    if (entry?.isDirectory) {
      const reader = entry.createReader();
      while (true) {
        const batch = await new Promise<any[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) break;
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
      }
    }
  }
  for (const item of Array.from(items)) {
    const entry = (item as any).webkitGetAsEntry?.();
    if (entry) await walk(entry);
    else {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}

export function App() {
  const [session, setSession] = useState<Session>();
  const [boot, setBoot] = useState<BootState>();
  const [ready, setReady] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [answerToken, setAnswerToken] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState("");
  const [activeWorkspacePanel, setActiveWorkspacePanel] = useState<WorkspacePanel | undefined>(
    () => window.innerWidth > 1100 ? "project" : undefined,
  );
  const setPanelOpen = useCallback((panel: WorkspacePanel, action: SetStateAction<boolean>) => {
    setActiveWorkspacePanel((current) => {
      const isOpen = current === panel;
      const shouldOpen = typeof action === "function" ? action(isOpen) : action;
      if (shouldOpen) return panel;
      return isOpen ? undefined : current;
    });
  }, []);
  const projectOpen = activeWorkspacePanel === "project";
  const filesOpen = activeWorkspacePanel === "files";
  const workbenchOpen = activeWorkspacePanel === "workbench";
  const runnerOpen = activeWorkspacePanel === "runner";
  const activityOpen = activeWorkspacePanel === "activity";
  const reviewOpen = activeWorkspacePanel === "review";
  const chatOpen = activeWorkspacePanel === "chat";
  const publishOpen = activeWorkspacePanel === "publish";
  const setProjectOpen = useCallback((action: SetStateAction<boolean>) => setPanelOpen("project", action), [setPanelOpen]);
  const setFilesOpen = useCallback((action: SetStateAction<boolean>) => setPanelOpen("files", action), [setPanelOpen]);
  const setWorkbenchOpen = useCallback((action: SetStateAction<boolean>) => setPanelOpen("workbench", action), [setPanelOpen]);
  const setRunnerOpen = useCallback((action: SetStateAction<boolean>) => setPanelOpen("runner", action), [setPanelOpen]);
  const setActivityOpen = useCallback((action: SetStateAction<boolean>) => setPanelOpen("activity", action), [setPanelOpen]);
  const setReviewOpen = useCallback((action: SetStateAction<boolean>) => setPanelOpen("review", action), [setPanelOpen]);
  const setChatOpen = useCallback((action: SetStateAction<boolean>) => setPanelOpen("chat", action), [setPanelOpen]);
  const setPublishOpen = useCallback((action: SetStateAction<boolean>) => setPanelOpen("publish", action), [setPanelOpen]);
  const [activeFileId, setActiveFileId] = useState("main");
  const [commandOpen, setCommandOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [securityError, setSecurityError] = useState("");
  const [dark, setDark] = useState(() => localStorage.getItem("sharecode:theme") !== "light");
  const [fontSize, setFontSize] = useState(() =>
    Math.min(20, Math.max(12, Number(localStorage.getItem("sharecode:font-size")) || 14)),
  );
  const [lineWrap, setLineWrap] = useState(
    () => localStorage.getItem("sharecode:line-wrap") === "on",
  );
  const [editorTheme, setEditorTheme] = useState<"light" | "dark" | "contrast">(
    () => (localStorage.getItem("sharecode:editor-theme") as "light" | "dark" | "contrast") || "dark",
  );
  const [tabSize, setTabSize] = useState(() => Number(localStorage.getItem("sharecode:tab-size")) || 2);
  const [keyBinding, setKeyBinding] = useState<"standard" | "vim" | "emacs">(
    () => (localStorage.getItem("sharecode:keybinding") as "standard" | "vim" | "emacs") || "standard",
  );
  const [minimap, setMinimap] = useState(() => localStorage.getItem("sharecode:minimap") !== "off");
  const [analysisReport, setAnalysisReport] = useState<AnalysisReport>();
  const [analyzing, setAnalyzing] = useState(false);
  const [projectWarnings, setProjectWarnings] = useState<string[]>([]);
  const [otherTabs, setOtherTabs] = useState(0);
  const [saveLeader, setSaveLeader] = useState(true);
  const [importProgress, setImportProgress] = useState<{
    name: string;
    percent: number;
    bytes: number;
    characters: number;
    lines: number;
    phase: "reading" | "syncing" | "verifying" | "saving";
  }>();
  const needsOnboarding = useRef(!sessionStorage.getItem("sharecode:guest-name"));
  const [onboardingOpen, setOnboardingOpen] = useState(needsOnboarding.current);
  const [onboardingError, setOnboardingError] = useState("");
  const [localName, setLocalName] = useState(randomGuestName);
  const [nameDraft, setNameDraft] = useState(localName);
  const [dragActive, setDragActive] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent>();
  const [recovery, setRecovery] = useState(true);
  const [revision, setRevision] = useState(0);
  const [stats, setStats] = useState({ lines: 1, words: 0, characters: 0 });
  const [peerCount, setPeerCount] = useState(0);
  const [presences, setPresences] = useState<Presence[]>([]);
  const [localFiles, setLocalFiles] = useState<Set<string>>(new Set());
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [previewFile, setPreviewFile] = useState<{ file: SharedFile; blob: Blob }>();
  const [toast, setToast] = useState("");
  const [judgeEndpoint, setJudgeEndpoint] = useState(() => localStorage.getItem("sharecode:judge0-endpoint") || "");
  const [localStream, setLocalStream] = useState<MediaStream>();
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [callMode, setCallMode] = useState<"audio" | "video">();
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const openCall = useCallback(() => {
    setActiveWorkspacePanel(undefined);
    setCallOpen(true);
  }, []);
  const bootStarted = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const sinks = useRef(new Map<string, IncomingSink>());
  const importInput = useRef<HTMLInputElement>(null);
  const importCancelled = useRef(false);
  const importInProgress = useRef(false);
  const localNameRef = useRef(localName);
  const localColor = useMemo(() => palette[Math.floor(Math.random() * palette.length)], []);
  const activeText = session?.codeFiles.get(activeFileId) || session?.text;
  const activeMeta = session?.codeFileMeta.get(activeFileId);
  const accessMode: AccessMode = boot?.invite?.access
    || (boot?.roomId ? sessionStorage.getItem(`p2p-share:access:${boot.roomId}`) as AccessMode : undefined)
    || "edit";
  const isReadOnly = accessMode === "read";

  useEffect(() => {
    localNameRef.current = localName;
  }, [localName]);

  useEffect(() => () => {
    localStream?.getTracks().forEach((track) => track.stop());
  }, [localStream]);

  useEffect(() => {
    if (!session || session.codeFiles.has(activeFileId)) return;
    setActiveFileId(session.codeFiles.keys().next().value || "main");
  }, [activeFileId, revision, session]);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    const handleInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handleInstall);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleInstall);
    };
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }, []);

  const startSession = useCallback(
    async (bootState: BootState, key?: CryptoKey) => {
      const doc = new Y.Doc();
      if (bootState.record?.payload) {
        const update = await decryptBytes(
          { payload: bootState.record.payload, iv: bootState.record.iv },
          key,
        );
        Y.applyUpdate(doc, update, "restore");
      }
      const text = doc.getText("content");
      const meta = doc.getMap("meta");
      const files = doc.getMap<SharedFile>("files");
      const messages = doc.getArray<ChatMessage>("chat");
      const logs = doc.getArray<VersionLog>("versions");
      const runner = doc.getMap("runner");
      const codeFiles = doc.getMap<Y.Text>("code-files");
      const codeFileMeta = doc.getMap<CodeFileMeta>("code-file-meta");
      const reviews = doc.getArray<ReviewEntry>("reviews");
      const description = doc.getText("description");
      if (!meta.has("name")) meta.set("name", bootState.record?.name || "untitled");
      if (!meta.has("language")) meta.set("language", bootState.record?.language || "javascript");
      if (!meta.has("visibility")) meta.set("visibility", "private");
      if (!meta.has("projectManifest")) {
        meta.set("projectManifest", {
          version: 1,
          name: String(bootState.record?.name || "untitled-project"),
          description: "",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } satisfies ProjectManifest);
      }
      if (bootState.invite?.access) {
        sessionStorage.setItem(`p2p-share:access:${bootState.roomId}`, bootState.invite.access);
      }
      if (!codeFiles.has("main")) {
        const main = new Y.Text();
        if (text.length) main.insert(0, text.toString());
        codeFiles.set("main", main);
        codeFileMeta.set("main", {
          name: String(meta.get("name") || "untitled"),
          language: String(meta.get("language") || "javascript"),
          createdBy: localNameRef.current,
          createdAt: Date.now(),
        });
      }
      const mainText = codeFiles.get("main")!;
      const locked = Boolean(bootState.record?.locked || bootState.invite?.locked);
      const salt = bootState.record?.salt || bootState.invite?.salt;
      const mesh = new PeerMesh(bootState.roomId, key);
      const tabs = new CrossTabCoordinator(bootState.roomId);
      const availableIds: string[] = [];
      for (const [id, file] of files.entries()) {
        if (await getFile(bootState.roomId, id)) {
          availableIds.push(id);
          // Peer IDs are intentionally ephemeral, so recovered file ownership follows this tab.
          files.set(id, { ...file, owner: mesh.peerId, ownerName: localNameRef.current, providers: [mesh.peerId] });
        }
      }
      setLocalFiles(new Set(availableIds));
      setSession({
        roomId: bootState.roomId, doc, text: mainText, meta, files, messages, logs, runner,
        codeFiles, codeFileMeta, reviews, description, mesh, key, locked, salt, tabs,
      });
      const recoverySetting = localStorage.getItem(`sharecode:recovery:${bootState.roomId}`) !== "off";
      setRecovery(recoverySetting);
      history.replaceState(null, "", roomUrl(bootState.roomId));
      setReady(true);
      if (bootState.inviteToken && !needsOnboarding.current) setShareOpen(true);
    },
    [],
  );

  useEffect(() => {
    if (bootStarted.current) return;
    bootStarted.current = true;
    void (async () => {
      try {
        const params = parseHash();
        const inviteToken = params.get("invite") || undefined;
        const invite = inviteToken ? await inspectInvite(inviteToken) : undefined;
        const roomId = invite?.roomId || params.get("room") || newRoomId();
        const record = await getRoom(roomId);
        const state = { roomId, record, invite, inviteToken };
        setBoot(state);
        if (record?.locked || invite?.locked) {
          setUnlockOpen(true);
        } else {
          await startSession(state);
        }
      } catch (error) {
        setUnlockError(error instanceof Error ? error.message : "Could not open this room.");
        setUnlockOpen(true);
      }
    })();
  }, [startSession]);

  const persist = useCallback(
    async (current = session) => {
      if (!current || !recovery || !current.tabs.isLeader) return;
      const update = Y.encodeStateAsUpdate(current.doc);
      const cipher = await encryptBytes(update, current.key);
      await putRoom({
        roomId: current.roomId,
        name: String(current.meta.get("name") || "untitled"),
        language: String(current.meta.get("language") || "text"),
        locked: current.locked,
        salt: current.salt,
        ...cipher,
        modifiedAt: Date.now(),
      });
    },
    [recovery, session],
  );

  useEffect(() => {
    if (!session) return;
    const redraw = () => setRevision((value) => value + 1);
    const scheduleSave = (_update: Uint8Array, origin: unknown) => {
      redraw();
      if (origin !== "remote" && origin !== "cross-tab" && origin !== STREAM_IMPORT_ORIGIN) {
        void session.mesh.send({ type: "y-update", update: bytesToBase64(_update) });
      }
      if (origin !== "cross-tab") session.tabs.sendUpdate(_update);
      const recent = {
        roomId: session.roomId,
        name: String((session.meta.get("projectManifest") as ProjectManifest | undefined)?.name || session.meta.get("name") || "untitled"),
        modifiedAt: Date.now(),
      };
      mergeRecentProject(recent);
      session.tabs.announceRecent(recent);
      if (!importInProgress.current) {
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => void persist(session), 350);
      }
    };
    session.doc.on("update", scheduleSave);
    session.files.observe(redraw);
    const offTabs = session.tabs.on("tabs", (event) => {
      setOtherTabs(event.detail.count);
      setSaveLeader(event.detail.leader);
    });
    const offTabUpdate = session.tabs.on("update", (event) => Y.applyUpdate(session.doc, event.detail, "cross-tab"));
    const offSnippet = session.tabs.on("snippet", (event) => {
      void addProjectCandidates([event.detail]);
      showToast(`Received ${event.detail.name} from another tab`);
    });
    const offRecent = session.tabs.on("recent", (event) => { mergeRecentProject(event.detail); });
    const offAppUpdate = session.tabs.on("app-update", (event) => showToast(`p2p-share ${event.detail} is ready in another tab. Reload to update.`));
    void persist(session);
    return () => {
      session.doc.off("update", scheduleSave);
      session.files.unobserve(redraw);
      offTabs();
      offTabUpdate();
      offSnippet();
      offRecent();
      offAppUpdate();
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [persist, session, showToast]);

  useEffect(() => {
    if (!session) return;
    return () => session.tabs.close();
  }, [session]);

  useEffect(() => {
    if (!session || !("serviceWorker" in navigator)) return;
    let registration: ServiceWorkerRegistration | undefined;
    const updateFound = () => {
      const worker = registration?.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          session.tabs.announceAppUpdate("update");
          showToast("A new app version is ready. Reload when convenient.");
        }
      });
    };
    void navigator.serviceWorker.ready.then((value) => {
      registration = value;
      registration.addEventListener("updatefound", updateFound);
    });
    return () => registration?.removeEventListener("updatefound", updateFound);
  }, [session, showToast]);

  useEffect(() => {
    if (!session || importInProgress.current) return;
    const timer = window.setTimeout(
      () => setStats(documentStats(activeText?.toString() || "")),
      (activeText?.length || 0) > LARGE_DOCUMENT_THRESHOLD ? 900 : 250,
    );
    return () => window.clearTimeout(timer);
  }, [activeText, revision, session]);

  useEffect(() => {
    if (!session || isReadOnly || !activeText || !activeMeta || activeMeta.language !== "text" || activeText.length < 8 || activeText.length > 1_000_000) return;
    const timer = window.setTimeout(() => {
      const detected = detectLanguage(activeText.toString(), activeMeta.name);
      if (detected !== "text") session.codeFileMeta.set(activeFileId, { ...activeMeta, language: detected });
    }, 550);
    return () => window.clearTimeout(timer);
  }, [activeFileId, activeMeta, activeText, isReadOnly, revision, session]);

  useEffect(() => {
    if (!session) return;
    const sendPresence = () =>
      void session.mesh.send({
        type: "presence",
        peerId: session.mesh.peerId,
        name: localNameRef.current,
        color: localColor,
        seenAt: Date.now(),
      });
    const offPeers = session.mesh.on("peers", (event) => {
      setPeerCount(event.detail);
      if (event.detail > 0) {
        void session.mesh.send({
          type: "sync-request",
          vector: bytesToBase64(Y.encodeStateVector(session.doc)),
        });
        sendPresence();
      }
    });
    const offError = session.mesh.on("error", (event) => {
      setShareError(event.detail);
    });
    const offMessage = session.mesh.on("message", (event) => {
      const { origin, body } = event.detail;
      void (async () => {
        if (body.type === "y-update" || body.type === "sync-response") {
          Y.applyUpdate(session.doc, base64ToBytes(String(body.update)), "remote");
          return;
        }
        if (body.type === "sync-request") {
          const vector = base64ToBytes(String(body.vector));
          await session.mesh.send({
            type: "sync-response",
            update: bytesToBase64(Y.encodeStateAsUpdate(session.doc, vector)),
          });
          return;
        }
        if (body.type === "hello") {
          sendPresence();
          await session.mesh.send({
            type: "sync-request",
            vector: bytesToBase64(Y.encodeStateVector(session.doc)),
          });
          return;
        }
        if (body.type === "presence") {
          const next: Presence = {
            peerId: String(body.peerId),
            name: String(body.name),
            color: String(body.color),
            lastSeen: Number(body.seenAt),
          };
          setPresences((current) => [
            ...current.filter((item) => item.peerId !== next.peerId),
            next,
          ]);
          if (session.mesh.peerId < next.peerId && !session.mesh.hasPeer(next.peerId)) {
            await session.mesh.createPeerOffer(next.peerId);
          }
          return;
        }
        if (body.type === "peer-offer" && body.target === session.mesh.peerId) {
          await session.mesh.acceptPeerOffer(
            String(body.offerId),
            String(body.inviter),
            body.description as RTCSessionDescriptionInit,
          );
          return;
        }
        if (body.type === "peer-answer" && body.target === session.mesh.peerId) {
          await session.mesh.acceptPeerAnswer(
            String(body.offerId),
            String(body.responder),
            body.description as RTCSessionDescriptionInit,
          );
          return;
        }
        if (body.type === "call-state") {
          const peerId = String(body.peerId);
          if (body.active) {
            openCall();
            showToast(`${String(body.name)} started a ${String(body.mode)} call`);
          } else {
            setRemoteStreams((current) => {
              const next = new Map(current);
              next.delete(peerId);
              return next;
            });
          }
          return;
        }
        if (body.type === "file-request" && body.target === session.mesh.peerId) {
          await sendFile(
            session,
            String(body.fileId),
            String(body.transferId),
            origin,
            setTransfers,
          );
          return;
        }
        if (body.type === "file-chunk" && body.target === session.mesh.peerId) {
          const transferId = String(body.transferId);
          const sink = sinks.current.get(transferId);
          if (!sink) return;
          const bytes = base64ToBytes(String(body.data));
          const index = Number(body.index);
          sink.chain = sink.chain.then(async () => {
            if (sink.writable) await sink.writable.write(bytes);
            else await putChunk(session.roomId, transferId, index, bytes);
            updateTransfer(setTransfers, transferId, { transferred: Number(body.offset) + bytes.length });
          });
          return;
        }
        if (body.type === "file-end" && body.target === session.mesh.peerId) {
          const transferId = String(body.transferId);
          const sink = sinks.current.get(transferId);
          if (!sink) return;
          sink.chain = sink.chain.then(async () => {
            if (sink.writable) {
              await sink.writable.close();
            } else {
              await finishChunks(
                session.roomId,
                transferId,
                sink.file.id,
                sink.file.type,
              );
              setLocalFiles((current) => new Set(current).add(sink.file.id));
              const currentMeta = session.files.get(sink.file.id);
              if (currentMeta) {
                session.files.set(sink.file.id, {
                  ...currentMeta,
                  providers: [...new Set([...(currentMeta.providers || [currentMeta.owner]), session.mesh.peerId])],
                });
              }
            }
            updateTransfer(setTransfers, transferId, {
              status: "done",
              transferred: sink.file.size,
            });
            sinks.current.delete(transferId);
            showToast(`${sink.file.name} received`);
          });
          return;
        }
        if (body.type === "file-error" && body.target === session.mesh.peerId) {
          const transferId = String(body.transferId);
          updateTransfer(setTransfers, transferId, {
            status: "failed",
            error: String(body.message),
          });
          sinks.current.delete(transferId);
          showToast(String(body.message));
        }
      })().catch((error) => {
        const message = error instanceof Error ? error.message : "Peer operation failed.";
        showToast(message);
      });
    });
    const offMedia = session.mesh.on("media", (event) => {
      setRemoteStreams((current) => new Map(current).set(event.detail.peerId, event.detail.stream));
    });
    const heartbeat = window.setInterval(() => {
      sendPresence();
      setPresences((current) => current.filter((item) => Date.now() - item.lastSeen < 45_000));
    }, 15_000);
    return () => {
      offPeers();
      offError();
      offMessage();
      offMedia();
      window.clearInterval(heartbeat);
      session.mesh.disconnect();
    };
  }, [localColor, openCall, session, showToast]);

  const unlock = async () => {
    if (!boot) return;
    if (!unlockPassword) {
      setUnlockError("Enter the room password.");
      return;
    }
    setUnlockError("");
    try {
      const salt = boot.record?.salt || boot.invite?.salt;
      if (!salt) throw new Error("This locked room is missing its encryption salt.");
      const key = await deriveRoomKey(unlockPassword, salt);
      await startSession(boot, key);
      setUnlockOpen(false);
      setUnlockPassword("");
    } catch (error) {
      setUnlockError(error instanceof Error ? error.message : "Could not unlock this room.");
    }
  };

  const createInvite = async (access: AccessMode) => {
    if (!session) return;
    setShareBusy(true);
    setShareError("");
    try {
      const token = await session.mesh.createInvite(session.locked, session.salt, access);
      const url = `${location.origin}${location.pathname}#invite=${encodeURIComponent(token)}`;
      setInviteLink(url);
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "Could not create an invite.");
    } finally {
      setShareBusy(false);
    }
  };

  const joinInvite = async () => {
    if (!session || !boot?.inviteToken) return;
    setShareBusy(true);
    setShareError("");
    try {
      setAnswerToken(await session.mesh.acceptInvite(boot.inviteToken));
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "Could not create an answer.");
    } finally {
      setShareBusy(false);
    }
  };

  const acceptAnswer = async (answer: string) => {
    if (!session) return;
    setShareBusy(true);
    setShareError("");
    try {
      await session.mesh.acceptAnswer(answer);
      setInviteLink("");
      showToast("Peer connected");
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "Could not accept this answer.");
    } finally {
      setShareBusy(false);
    }
  };

  const applyPassword = async () => {
    if (!session) return;
    setSecurityError("");
    if (password.length < 8) {
      setSecurityError("Use at least 8 characters.");
      return;
    }
    if (password !== passwordConfirm) {
      setSecurityError("Passwords do not match.");
      return;
    }
    const salt = createSalt();
    const key = await deriveRoomKey(password, salt);
    session.mesh.disconnect();
    session.mesh.setKey(key);
    const next = { ...session, key, locked: true, salt };
    setSession(next);
    setPassword("");
    setPasswordConfirm("");
    setSecurityOpen(false);
    await persist(next);
    showToast("Room locked. Existing peers were disconnected.");
  };

  const removePassword = async () => {
    if (!session) return;
    session.mesh.disconnect();
    session.mesh.setKey(undefined);
    const next = { ...session, key: undefined, locked: false, salt: undefined };
    setSession(next);
    setSecurityOpen(false);
    await persist(next);
    showToast("Password removed. Existing peers were disconnected.");
  };

  const toggleRecovery = async () => {
    if (!session) return;
    const next = !recovery;
    setRecovery(next);
    localStorage.setItem(`sharecode:recovery:${session.roomId}`, next ? "on" : "off");
    if (!next) {
      await deleteRoom(session.roomId);
      showToast("Local recovery data deleted");
    } else {
      window.setTimeout(() => void persist(session), 0);
      showToast("Local recovery enabled");
    }
  };

  const uploadFiles = async (list: FileList) => {
    if (!session || isReadOnly) return;
    for (const file of Array.from(list)) {
      if (file.size > MAX_FILE_SIZE) {
        showToast(`${file.name} is larger than the 1 GB limit.`);
        continue;
      }
      const id = crypto.randomUUID();
      const transferId = `upload-${id}`;
      setTransfers((current) => [...current, {
        id: transferId,
        fileId: id,
        name: file.name,
        direction: "send",
        transferred: 0,
        total: file.size,
        status: "running",
        startedAt: Date.now(),
      }]);
      try {
        await putFile(session.roomId, id, file);
        session.files.set(id, {
          id,
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          owner: session.mesh.peerId,
          ownerName: localName,
          providers: [session.mesh.peerId],
          addedAt: Date.now(),
        });
        setLocalFiles((current) => new Set(current).add(id));
        updateTransfer(setTransfers, transferId, { transferred: file.size, status: "done" });
      } catch (error) {
        const message = error instanceof Error ? error.message : `Could not add ${file.name}.`;
        updateTransfer(setTransfers, transferId, { status: "failed", error: message });
        showToast(message);
      }
    }
  };

  const copyDocument = async () => {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(activeText?.toString() || "");
      showToast("Code copied to clipboard");
    } catch {
      showToast("Clipboard access was blocked by this browser.");
    }
  };

  const exportDocument = () => {
    if (!session) return;
    const name = activeMeta?.name || "untitled";
    const language = activeMeta?.language || "text";
    downloadText(activeText?.toString() || "", documentFilename(name, language));
    showToast("Document downloaded");
  };

  const importDocument = async (file?: File) => {
    if (!session || !file || isReadOnly) return;
    if (file.size > MAX_EDITOR_FILE_SIZE) {
      showToast("The collaborative editor accepts text files up to 512 MB. Share larger files as attachments.");
      return;
    }
    if (!activeText) return;
    const estimatedCurrentSize = [...session.codeFiles.entries()].reduce((total, [id, text]) => {
      const recordedSize = session.codeFileMeta.get(id)?.size || 0;
      return total + Math.max(recordedSize, text.length);
    }, 0);
    const replacedSize = activeText.length
      ? 0
      : Math.max(activeMeta?.size || 0, activeText.length);
    if (estimatedCurrentSize - replacedSize + file.size > MAX_PROJECT_SIZE) {
      showToast("This file would exceed the 512 MB collaborative project limit.");
      return;
    }
    const sample = new Uint8Array(await file.slice(0, 8_192).arrayBuffer());
    if (isProbablyBinary(sample)) {
      showToast("This file appears to be binary. Share it as an attachment instead of opening it in the editor.");
      return;
    }
    let targetText = activeText;
    let targetId = activeFileId;
    if (activeText.length) {
      targetId = crypto.randomUUID();
      targetText = new Y.Text();
      session.codeFiles.set(targetId, targetText);
      session.codeFileMeta.set(targetId, {
        name: file.name,
        language: languageFromFilename(file.name),
        createdBy: localName,
        createdAt: Date.now(),
        size: file.size,
      });
      setActiveFileId(targetId);
    }
    importCancelled.current = false;
    importInProgress.current = true;
    (document.activeElement as HTMLElement | null)?.blur();
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
    }
    setImportProgress({
      name: file.name,
      percent: 0,
      bytes: 0,
      characters: 0,
      lines: 1,
      phase: "reading",
    });
    if (!activeText.length) {
      const previous = session.codeFileMeta.get(targetId);
      session.codeFileMeta.set(targetId, {
        name: file.name,
        language: languageFromFilename(file.name),
        createdBy: previous?.createdBy || localName,
        createdAt: previous?.createdAt || Date.now(),
        size: file.size,
      });
    }
    try {
      if (targetText.length) {
        session.logs.push([{
          id: crypto.randomUUID(),
          peerId: session.mesh.peerId,
          author: localName,
          color: localColor,
          action: "delete",
          fromLine: 1,
          toLine: stats.lines,
          text: `[Previous ${stats.lines.toLocaleString()}-line document replaced by imported file]`,
          timestamp: Date.now(),
        }]);
        targetText.delete(0, targetText.length);
      }
      let peerSync = Promise.resolve();
      let peerSyncFailed = false;
      const enqueuePeerUpdate = (update: Uint8Array) => {
        peerSync = peerSync
          .then(() => session.mesh.send({ type: "y-update", update: bytesToBase64(update) }))
          .catch(() => { peerSyncFailed = true; });
        return peerSync;
      };
      const reportProgress = (progress: StreamImportProgress) => {
        setImportProgress({
          name: file.name,
          percent: file.size ? Math.min(99, Math.floor((progress.bytesRead / file.size) * 100)) : 99,
          bytes: progress.bytesRead,
          characters: progress.characters,
          lines: progress.lines,
          phase: "reading",
        });
      };
      const result = await streamUtf8Blob(file, {
        chunkCharacters: 1024 * 1024,
        isCancelled: () => importCancelled.current,
        onProgress: reportProgress,
        onChunk: async (value, progress) => {
          let importUpdate: Uint8Array | undefined;
          const captureUpdate = (update: Uint8Array, origin: unknown) => {
            if (origin === STREAM_IMPORT_ORIGIN) importUpdate = update;
          };
          session.doc.on("update", captureUpdate);
          session.doc.transact(() => {
            targetText.insert(targetText.length, value);
          }, STREAM_IMPORT_ORIGIN);
          session.doc.off("update", captureUpdate);
          if (importUpdate) void enqueuePeerUpdate(importUpdate);
          reportProgress(progress);
          // Bound queued peer data without making local disk reads wait for every
          // individual WebRTC frame.
          if (progress.chunks % 4 === 0) await peerSync;
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        },
      });
      setImportProgress((current) => current && { ...current, percent: 99, phase: "syncing" });
      await peerSync;
      setImportProgress((current) => current && { ...current, phase: "verifying" });
      if (result.bytesRead !== file.size || targetText.length < result.characters) {
        throw new Error("The imported content failed its completeness check.");
      }
      let finalUpdate: Uint8Array | undefined;
      const captureFinalUpdate = (update: Uint8Array, origin: unknown) => {
        if (origin === STREAM_IMPORT_ORIGIN) finalUpdate = update;
      };
      session.doc.on("update", captureFinalUpdate);
      session.doc.transact(() => {
        const previous = session.codeFileMeta.get(targetId);
        session.codeFileMeta.set(targetId, {
          name: file.name,
          language: languageFromFilename(file.name),
          createdBy: previous?.createdBy || localName,
          createdAt: previous?.createdAt || Date.now(),
          size: file.size,
        });
        session.logs.push([{
          id: crypto.randomUUID(),
          peerId: session.mesh.peerId,
          author: localName,
          color: localColor,
          action: "insert",
          fromLine: 1,
          toLine: result.lines,
          text: `[Imported ${result.lines.toLocaleString()} lines, ${result.characters.toLocaleString()} characters, and ${result.bytesRead.toLocaleString()} bytes from ${file.name}]`,
          timestamp: Date.now(),
        }]);
      }, STREAM_IMPORT_ORIGIN);
      session.doc.off("update", captureFinalUpdate);
      if (finalUpdate) await enqueuePeerUpdate(finalUpdate);
      setImportProgress((current) => current && { ...current, percent: 100, phase: "saving" });
      importInProgress.current = false;
      try {
        await persist(session);
      } catch {
        showToast(`${file.name} imported completely, but browser storage could not cache it.`);
        return;
      }
      showToast(peerSyncFailed
        ? `${file.name} imported completely. A peer may need to reconnect to finish syncing.`
        : `${file.name} imported completely`);
    } catch (error) {
      importInProgress.current = false;
      try {
        await persist(session);
      } catch {
        // The partial document remains usable in memory even when local
        // recovery storage is unavailable.
      }
      showToast(error instanceof DOMException && error.name === "AbortError"
        ? "Import cancelled. The content imported so far remains in the editor."
        : error instanceof Error ? error.message : "This file could not be imported as text.");
    } finally {
      importInProgress.current = false;
      setImportProgress(undefined);
      importCancelled.current = false;
      setRevision((value) => value + 1);
    }
  };

  const addProjectCandidates = async (candidates: ImportCandidate[]) => {
    if (!session || isReadOnly || !candidates.length) return;
    const existing = new Set([...session.codeFileMeta.values()].map((meta) => meta.name.toLowerCase()));
    const currentSize = materializeProject(session.codeFiles, session.codeFileMeta)
      .reduce((total, file) => total + new Blob([file.content]).size, 0);
    const incomingSize = candidates.reduce((total, file) => total + new Blob([file.content]).size, 0);
    if (session.codeFiles.size + candidates.length > MAX_PROJECT_FILES) {
      showToast(`Projects are limited to ${MAX_PROJECT_FILES.toLocaleString()} text files.`);
      return;
    }
    if (currentSize + incomingSize > MAX_PROJECT_SIZE) {
      showToast("This import would exceed the 512 MB collaborative project limit.");
      return;
    }
    let firstId = "";
    session.doc.transact(() => {
      for (const candidate of candidates) {
        let path = sanitizeProjectPath(candidate.name);
        if (existing.has(path.toLowerCase())) {
          const dot = path.lastIndexOf(".");
          const stem = dot > -1 ? path.slice(0, dot) : path;
          const suffix = dot > -1 ? path.slice(dot) : "";
          let copy = 2;
          while (existing.has(`${stem}-${copy}${suffix}`.toLowerCase())) copy += 1;
          path = `${stem}-${copy}${suffix}`;
        }
        existing.add(path.toLowerCase());
        const id = crypto.randomUUID();
        const text = new Y.Text();
        if (candidate.content) text.insert(0, candidate.content);
        session.codeFiles.set(id, text);
        session.codeFileMeta.set(id, {
          name: path,
          language: candidate.language,
          createdBy: localName,
          createdAt: Date.now(),
          size: new Blob([candidate.content]).size,
        });
        if (!firstId) firstId = id;
      }
    }, "project-import");
    if (firstId) setActiveFileId(firstId);
    showToast(`${candidates.length.toLocaleString()} project ${candidates.length === 1 ? "file" : "files"} imported`);
  };

  const importProjectFiles = async (list: FileList | File[]) => {
    if (isReadOnly) return;
    const candidates: ImportCandidate[] = [];
    const warnings: string[] = [];
    for (const file of Array.from(list)) {
      if (file.name.toLowerCase().endsWith(".zip")) {
        await importZip(file);
        continue;
      }
      try {
        candidates.push(await readTextProjectFile(file));
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : `${file.name} was skipped.`);
      }
    }
    if (warnings.length) setProjectWarnings((current) => [...current, ...warnings].slice(-20));
    await addProjectCandidates(candidates);
  };

  const importZip = async (file: File) => {
    if (isReadOnly || !session) return;
    try {
      const result = await importProjectZip(file);
      setProjectWarnings((current) => [...current, ...result.warnings].slice(-20));
      await addProjectCandidates(result.files);
      if (result.manifest) session.meta.set("projectManifest", {
        ...result.manifest,
        version: 1,
        updatedAt: Date.now(),
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "The ZIP project could not be imported.");
    }
  };

  const createProjectFile = (path?: string) => {
    if (isReadOnly || !session) return;
    const requested = path ?? window.prompt("File path", `src/untitled-${session.codeFiles.size + 1}.js`);
    if (!requested) return;
    const name = sanitizeProjectPath(requested);
    const id = crypto.randomUUID();
    session.codeFiles.set(id, new Y.Text());
    session.codeFileMeta.set(id, {
      name,
      language: languageFromFilename(name),
      createdBy: localName,
      createdAt: Date.now(),
      size: 0,
    });
    setActiveFileId(id);
  };

  const renameProjectFile = (id: string) => {
    if (isReadOnly || !session) return;
    const meta = session.codeFileMeta.get(id);
    if (!meta) return;
    const requested = window.prompt("Rename file or move it to another folder", meta.name);
    if (!requested) return;
    const name = sanitizeProjectPath(requested);
    session.codeFileMeta.set(id, { ...meta, name, language: languageFromFilename(name) });
  };

  const duplicateProjectFile = (id: string) => {
    if (isReadOnly || !session) return;
    const meta = session.codeFileMeta.get(id);
    const source = session.codeFiles.get(id);
    if (!meta || !source) return;
    const dot = meta.name.lastIndexOf(".");
    const name = `${dot > -1 ? meta.name.slice(0, dot) : meta.name}-copy${dot > -1 ? meta.name.slice(dot) : ""}`;
    const nextId = crypto.randomUUID();
    const text = new Y.Text();
    if (source.length) text.insert(0, source.toString());
    session.codeFiles.set(nextId, text);
    session.codeFileMeta.set(nextId, { ...meta, name, createdBy: localName, createdAt: Date.now() });
    setActiveFileId(nextId);
  };

  const deleteProjectFile = (id: string) => {
    if (!session) return;
    if (isReadOnly || session.codeFiles.size <= 1) {
      if (session.codeFiles.size <= 1) showToast("A project must keep at least one file.");
      return;
    }
    const meta = session.codeFileMeta.get(id);
    if (!window.confirm(`Delete ${meta?.name || "this file"} for every peer?`)) return;
    session.codeFiles.delete(id);
    session.codeFileMeta.delete(id);
    if (activeFileId === id) setActiveFileId(session.codeFileMeta.keys().next().value || "main");
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      setAnalysisReport(await analyzeCode(activeText?.toString() || "", activeMeta?.language || "text"));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  };

  const formatActiveFile = async () => {
    if (isReadOnly || !session) {
      showToast("This invite is read only.");
      return;
    }
    try {
      const formatted = await formatCode(activeText?.toString() || "", activeMeta?.language || "text", tabSize);
      session.doc.transact(() => {
        if (activeText?.length) activeText.delete(0, activeText.length);
        if (formatted) activeText?.insert(0, formatted);
      }, "format");
      showToast("File formatted locally");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "This file could not be formatted.");
    }
  };

  const clearDocument = () => {
    if (!session || isReadOnly || !activeText?.length || !window.confirm("Clear the current collaborative file for everyone?")) return;
    const removed = activeText.toString();
    session.doc.transact(() => {
      session.logs.push([{
        id: crypto.randomUUID(), peerId: session.mesh.peerId, author: localName, color: localColor,
        action: "delete", fromLine: 1, toLine: documentStats(removed).lines, text: removed, timestamp: Date.now(),
      }]);
      activeText.delete(0, activeText.length);
    });
    showToast("Editor cleared");
  };

  const createNewRoom = () => {
    if (
      session?.text.length &&
      !window.confirm("Create a new room? Your current room remains available from its recovery link.")
    ) {
      return;
    }
    location.href = `${location.pathname}#room=${newRoomId()}`;
    location.reload();
  };

  const savePreferences = () => {
    const nextName = nameDraft.trim() || randomGuestName();
    sessionStorage.setItem("sharecode:guest-name", nextName);
    localStorage.setItem("sharecode:font-size", String(fontSize));
    localStorage.setItem("sharecode:line-wrap", lineWrap ? "on" : "off");
    localStorage.setItem("sharecode:editor-theme", editorTheme);
    localStorage.setItem("sharecode:tab-size", String(tabSize));
    localStorage.setItem("sharecode:keybinding", keyBinding);
    localStorage.setItem("sharecode:minimap", minimap ? "on" : "off");
    setLocalName(nextName);
    setNameDraft(nextName);
    void session?.mesh.send({
      type: "presence",
      peerId: session.mesh.peerId,
      name: nextName,
      color: localColor,
      seenAt: Date.now(),
    });
    setSecurityOpen(false);
    showToast("Preferences saved");
  };

  const completeOnboarding = () => {
    const nextName = nameDraft.trim();
    if (nextName.length < 2) {
      setOnboardingError("Enter at least 2 characters.");
      return;
    }
    sessionStorage.setItem("sharecode:guest-name", nextName);
    needsOnboarding.current = false;
    setLocalName(nextName);
    setNameDraft(nextName);
    setOnboardingError("");
    setOnboardingOpen(false);
    void session?.mesh.send({
      type: "presence",
      peerId: session.mesh.peerId,
      name: nextName,
      color: localColor,
      seenAt: Date.now(),
    });
    if (boot?.inviteToken) setShareOpen(true);
  };

  const sendChatMessage = (text: string) => {
    const value = text.trim();
    if (!value || !session) return;
    session.messages.push([{
      id: crypto.randomUUID(),
      peerId: session.mesh.peerId,
      sender: localName,
      color: localColor,
      text: value.slice(0, 2000),
      sentAt: Date.now(),
    }]);
    const overflow = session.messages.length - 500;
    if (overflow > 0) session.messages.delete(0, overflow);
  };

  const runCode = async (stdin: string) => {
    if (!session) return;
    const language = activeMeta?.language || "text";
    const running = emptyRunResult(session.mesh.peerId, localName, language);
    session.runner.set("result", running);
    try {
      let output: { stdout: string; stderr: string; durationMs: number };
      if (canRunLocally(language)) {
        output = await runLocalCode(activeText?.toString() || "", language);
      } else {
        if (!judgeEndpoint) throw new Error("Configure a trusted Judge0 CE endpoint first.");
        if (!window.confirm(`Send the current ${language} code to ${judgeEndpoint} for execution?`)) {
          session.runner.delete("result");
          return;
        }
        output = await runWithJudge0(judgeEndpoint, language, activeText?.toString() || "", stdin);
      }
      session.runner.set("result", {
        ...running,
        ...output,
        status: output.stderr ? "error" : "success",
      } satisfies RunResult);
    } catch (error) {
      const timeout = error instanceof DOMException && error.name === "TimeoutError";
      session.runner.set("result", {
        ...running,
        status: timeout ? "timeout" : "error",
        stderr: error instanceof Error ? error.message : "Execution failed.",
        durationMs: Date.now() - running.timestamp,
      } satisfies RunResult);
    }
  };

  const startCall = async (mode: "audio" | "video") => {
    if (!session) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: mode === "video" ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } : false,
      });
      setLocalStream(stream);
      setCallMode(mode);
      setMuted(false);
      setCameraOff(false);
      await session.mesh.setLocalMedia(stream);
      await session.mesh.send({
        type: "call-state",
        peerId: session.mesh.peerId,
        name: localName,
        mode,
        active: true,
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Camera or microphone access was not available.");
    }
  };

  const leaveCall = () => {
    localStream?.getTracks().forEach((track) => track.stop());
    void session?.mesh.setLocalMedia();
    void session?.mesh.send({
      type: "call-state",
      peerId: session.mesh.peerId,
      name: localName,
      mode: callMode,
      active: false,
    });
    setLocalStream(undefined);
    setRemoteStreams(new Map());
    setCallMode(undefined);
  };

  const downloadFile = async (file: SharedFile) => {
    if (!session) return;
    const local = await getFile(session.roomId, file.id);
    if (local) {
      const url = URL.createObjectURL(local);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return;
    }
    const connectedIds = new Set(presences.map((presence) => presence.peerId));
    const provider = (file.providers?.length ? file.providers : [file.owner])
      .find((peerId) => connectedIds.has(peerId));
    if (!provider) {
      showToast("No peer with this file is online. Try again when a provider reconnects.");
      return;
    }
    const transferId = crypto.randomUUID();
    let writable: any;
    if ("showSaveFilePicker" in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({ suggestedName: file.name });
        writable = await handle.createWritable();
      } catch (error) {
        if ((error as DOMException).name === "AbortError") return;
      }
    }
    sinks.current.set(transferId, { file, transferId, writable, chain: Promise.resolve() });
    setTransfers((current) => [
      ...current,
      {
        id: transferId,
        fileId: file.id,
        name: file.name,
        direction: "receive",
        transferred: 0,
        total: file.size,
        status: "running",
        startedAt: Date.now(),
      },
    ]);
    await session.mesh.send({
      type: "file-request",
      target: provider,
      fileId: file.id,
      transferId,
    });
    window.setTimeout(() => {
      setTransfers((current) => current.map((transfer) => {
        if (transfer.id !== transferId || transfer.status !== "running" || transfer.transferred > 0) return transfer;
        sinks.current.delete(transferId);
        return { ...transfer, status: "failed", error: "The provider did not start the transfer. Try another online peer." };
      }));
    }, 30_000);
  };

  const previewSharedFile = async (file: SharedFile) => {
    if (!session) return;
    const blob = await getFile(session.roomId, file.id);
    if (!blob) {
      showToast("Download this file before previewing it.");
      return;
    }
    setPreviewFile({ file, blob });
  };

  const shareFileInvite = async (file: SharedFile) => {
    if (!session) return;
    setShareBusy(true);
    setShareError("");
    try {
      const token = await session.mesh.createInvite(session.locked, session.salt, "read");
      const url = `${location.origin}${location.pathname}#invite=${encodeURIComponent(token)}`;
      setInviteLink(url);
      setShareOpen(true);
      const text = `${localName} shared “${file.name}” (${(file.size / 1024 / 1024).toFixed(1)} MB) through p2p-share. This one-time read-only invite connects your browsers directly so you can request the file.`;
      const nativeShare = navigator.share;
      if (typeof nativeShare === "function") await nativeShare.call(navigator, { title: `Shared file: ${file.name}`, text, url });
      else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        showToast("File invite copied");
      }
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        const message = error instanceof Error ? error.message : "This browser could not create the file invite.";
        setShareError(message);
        showToast(message);
      }
    } finally {
      setShareBusy(false);
    }
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setCommandOpen((value) => !value);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!session) return;
        const name = activeMeta?.name || "untitled";
        const language = activeMeta?.language || "text";
        downloadText(activeText?.toString() || "", documentFilename(name, language));
        showToast("Document downloaded");
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [activeMeta, activeText, session, showToast]);

  const commands = useMemo<Command[]>(() => [
    { id: "find", label: "Find and replace", detail: "Search text or regular expressions in the active file", shortcut: "Ctrl F", run: () => window.dispatchEvent(new CustomEvent("p2p-editor-command", { detail: "find" })) },
    { id: "format", label: "Format active file", detail: "Use the browser worker formatter", shortcut: "Shift Alt F", run: () => void formatActiveFile() },
    { id: "analyze", label: "Analyze active file", detail: "Run diagnostics, TODO, dependency and complexity checks", run: () => { setWorkbenchOpen(true); void runAnalysis(); } },
    { id: "preview", label: "Open safe preview", detail: "Preview this project in an isolated sandbox", run: () => setWorkbenchOpen(true) },
    { id: "new-file", label: "Create project file", detail: "Add a collaborative file or path", run: () => createProjectFile() },
    { id: "project", label: "Toggle project explorer", detail: "Show the project file tree and manifest", run: () => setProjectOpen((value) => !value) },
    { id: "files", label: "Share files", detail: "Upload, preview, request, and monitor direct peer transfers", run: () => setFilesOpen(true) },
    { id: "share", label: "Invite a peer", detail: "Create editable or read-only invite links and QR codes", run: () => setShareOpen(true) },
    { id: "settings", label: "Editor settings", detail: "Theme, font, tab width, minimap and keybindings", run: () => setSecurityOpen(true) },
  ], [activeMeta, activeText, isReadOnly, session, tabSize]);

  if (!ready || !session) {
    return (
      <main className="loading-screen">
        <div className="brand-mark"><img src="./logo.png" alt="" /></div>
        <span>{unlockOpen ? "Private room" : "Preparing your room…"}</span>
        <Dialog
          open={unlockOpen}
          title="Unlock private room"
          description="The password stays in this tab and is used to derive the room encryption key."
          closeable={false}
        >
          <div className="dialog-body stack">
            <div className="field-group">
              <label htmlFor="unlock-password">Room password</label>
              <input
                id="unlock-password"
                autoFocus
                type="password"
                value={unlockPassword}
                onChange={(event) => setUnlockPassword(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void unlock()}
              />
            </div>
            <button className="primary-button" onClick={() => void unlock()}>Unlock room</button>
            {unlockError && <p className="form-error" role="alert">{unlockError}</p>}
          </div>
        </Dialog>
      </main>
    );
  }

  const name = activeMeta?.name || "untitled";
  const language = activeMeta?.language || "text";
  const totalProjectSize = [...session.codeFiles.entries()].reduce((total, [id, text]) => {
    const recordedSize = session.codeFileMeta.get(id)?.size || 0;
    return total + Math.max(recordedSize, text.length);
  }, 0);
  const manifest = session.meta.get("projectManifest") as ProjectManifest;
  // Workbench tools require complete strings. Keep those copies out of the
  // normal editor render path, especially while a large import is streaming.
  const projectFiles = workbenchOpen
    ? materializeProject(session.codeFiles, session.codeFileMeta)
    : [];
  const activeProjectFile = projectFiles.find((file) => file.id === activeFileId) || projectFiles[0];
  const sharedFiles = [...session.files.values()].sort((a, b) => b.addedAt - a.addedAt);
  const allPresence: Presence[] = [
    { peerId: session.mesh.peerId, name: localName, color: localColor, lastSeen: Date.now(), local: true },
    ...presences,
  ];

  return (
    <div
      className={`app ${dark ? "dark" : "light"} ${importProgress ? "importing" : ""}`}
      data-active-panel={activeWorkspacePanel || "none"}
      data-revision={revision}
    >
      <header className="topbar">
        <button className="brand" onClick={() => setFilesOpen((value) => !value)} aria-label="Toggle shared files" aria-pressed={filesOpen}>
          <span className="brand-mark"><img src="./logo.png" alt="" /></span>
          <span>p2p-share</span>
        </button>
        <div className="document-name">
          <span className="save-dot" title={recovery ? "Saved locally" : "Ephemeral mode"} />
          <input
            aria-label="Document name"
            value={name}
            readOnly={isReadOnly || Boolean(importProgress)}
            onChange={(event) => session.codeFileMeta.set(activeFileId, {
              ...(activeMeta || { language: "text", createdBy: localName, createdAt: Date.now() }),
              name: event.target.value,
            })}
          />
        </div>
        <div className="topbar-actions">
          <div className="presence-stack" aria-label={`${peerCount} connected peers`}>
            {allPresence.slice(0, 4).map((presence) => (
              <span
                key={presence.peerId}
                className="avatar"
                title={`${presence.name}${presence.local ? " (you)" : ""}`}
                style={{ background: presence.color }}
              >
                {presence.name.slice(0, 1).toUpperCase()}
              </span>
            ))}
          </div>
          <button className="status-pill" onClick={() => setShareOpen(true)}>
            <span className={`status-dot ${peerCount ? "online" : ""}`} />
            {peerCount ? `${peerCount + 1} here` : "Only you"}
          </button>
          <div className="desktop-tools">
            <button className="icon-button top-icon" onClick={() => setFilesOpen((value) => !value)} aria-label="Open direct file sharing" aria-pressed={filesOpen} title="Share files">
              <Icon name="attachment" />
            </button>
            <button className="icon-button top-icon" onClick={() => setProjectOpen((value) => !value)} aria-label="Toggle project explorer" aria-pressed={projectOpen} title="Project explorer">
              <Icon name="folder" />
            </button>
            <button className="icon-button top-icon" onClick={() => setWorkbenchOpen((value) => !value)} aria-label="Open local developer workbench" aria-pressed={workbenchOpen} title="Analyze & preview">
              <Icon name="braces" />
            </button>
            <button className="icon-button top-icon" onClick={() => setCommandOpen(true)} aria-label="Open command palette" title="Command palette (Ctrl+Shift+P)">
              <Icon name="search" />
            </button>
            <button className="icon-button top-icon" onClick={openCall} aria-label="Open audio or video call" title="Room call">
              <Icon name="video" />
            </button>
            <button className="icon-button top-icon" onClick={() => setRunnerOpen((value) => !value)} aria-label="Open code runner" aria-pressed={runnerOpen} title="Run code">
              <Icon name="play" />
            </button>
            <button className="icon-button top-icon" onClick={() => setActivityOpen((value) => !value)} aria-label="Open version logs" aria-pressed={activityOpen} title="Version logs">
              <Icon name="history" />
            </button>
            <button className="icon-button top-icon" onClick={() => setReviewOpen((value) => !value)} aria-label="Open code review discussions" aria-pressed={reviewOpen} title="Code review">
              <Icon name="review" />
            </button>
            <button className="icon-button top-icon" onClick={() => setChatOpen((value) => !value)} aria-label="Open group chat" aria-pressed={chatOpen} title="Group chat">
              <Icon name="chat" />
            </button>
            <button className="icon-button top-icon" disabled={isReadOnly} onClick={() => importInput.current?.click()} aria-label="Open text file" title="Open text file">
              <Icon name="edit" />
            </button>
            <button className="icon-button top-icon" onClick={() => void copyDocument()} aria-label="Copy code" title="Copy code">
              <Icon name="copy" />
            </button>
            <button className="icon-button top-icon" onClick={exportDocument} aria-label="Download code" title="Download code (Ctrl+S)">
              <Icon name="download" />
            </button>
          </div>
          <button className="share-button" onClick={() => setShareOpen(true)}>
            <Icon name="share" />
            <span>Share</span>
          </button>
          <button className="icon-button top-icon" onClick={() => setPublishOpen((value) => !value)} aria-label="Publish code and Git integration" aria-pressed={publishOpen} title="Publish code">
            <Icon name="publish" />
          </button>
          <button
            className="icon-button top-icon"
            onClick={() => {
              const next = !dark;
              setDark(next);
              localStorage.setItem("sharecode:theme", next ? "dark" : "light");
            }}
            aria-label={`Use ${dark ? "light" : "dark"} theme`}
          >
            <Icon name={dark ? "sun" : "moon"} />
          </button>
          <button className="icon-button top-icon" onClick={() => setSecurityOpen(true)} aria-label="Privacy settings">
            <Icon name="settings" />
          </button>
        </div>
      </header>

      <input
        ref={importInput}
        type="file"
        hidden
        onChange={(event) => {
          void importDocument(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      <div
        className="workspace"
        onDragEnter={(event) => {
          if (event.dataTransfer.types.includes("Files")) setDragActive(true);
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) event.preventDefault();
        }}
        onDragLeave={(event) => {
          if (
            !event.relatedTarget ||
            !event.currentTarget.contains(event.relatedTarget as Node)
          ) {
            setDragActive(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          if (!isReadOnly && event.dataTransfer.items.length) {
            void droppedProjectFiles(event.dataTransfer.items).then(importProjectFiles);
          }
        }}
      >
        {activeWorkspacePanel && activeWorkspacePanel !== "runner" && (
          <button
            className="files-scrim"
            aria-label={`Close ${activeWorkspacePanel} panel`}
            onClick={() => setActiveWorkspacePanel(undefined)}
          />
        )}
        <ProjectPanel
          open={projectOpen}
          files={[...session.codeFileMeta.entries()]}
          activeId={activeFileId}
          manifest={manifest}
          totalSize={totalProjectSize}
          readOnly={isReadOnly || Boolean(importProgress)}
          warnings={projectWarnings}
          otherTabs={otherTabs}
          onClose={() => setProjectOpen(false)}
          onSelect={setActiveFileId}
          onCreate={createProjectFile}
          onRename={renameProjectFile}
          onDuplicate={duplicateProjectFile}
          onDelete={deleteProjectFile}
          onImportFiles={(files) => void importProjectFiles(files)}
          onImportZip={(file) => void importZip(file)}
          onDownloadZip={() => void downloadProjectZip(
            materializeProject(session.codeFiles, session.codeFileMeta),
            manifest,
          )}
          onManifestChange={(value) => session.meta.set("projectManifest", value)}
          onSendToTab={() => {
            const content = session.codeFiles.get(activeFileId);
            const metadata = session.codeFileMeta.get(activeFileId);
            if (!content || !metadata) return;
            session.tabs.sendSnippet(metadata.name, metadata.language, content.toString());
            showToast(`Sent ${metadata.name} to ${otherTabs} other ${otherTabs === 1 ? "tab" : "tabs"}`);
          }}
        />
        <FilesPanel
          open={filesOpen}
          files={sharedFiles}
          localFiles={localFiles}
          transfers={transfers}
          onlinePeerIds={new Set(presences.map((presence) => presence.peerId))}
          currentPeerId={session.mesh.peerId}
          readOnly={isReadOnly}
          onUpload={(files) => void uploadFiles(files)}
          onDownload={(file) => void downloadFile(file)}
          onPreview={(file) => void previewSharedFile(file)}
          onShare={(file) => void shareFileInvite(file)}
          onRemove={(file) => {
            if (isReadOnly) return;
            session.files.delete(file.id);
            setLocalFiles((current) => {
              const next = new Set(current);
              next.delete(file.id);
              return next;
            });
            void deleteFile(session.roomId, file.id);
            showToast(`${file.name} removed from the room`);
          }}
          onClearTransfers={() => setTransfers([])}
          onClose={() => setFilesOpen(false)}
        />
        <main className="editor-shell">
          <CodeFileTabs
            files={[...session.codeFileMeta.entries()]}
            activeId={activeFileId}
            readOnly={isReadOnly || Boolean(importProgress)}
            onSelect={(id) => {
              if (!importProgress) setActiveFileId(id);
            }}
            onAdd={() => {
              createProjectFile();
            }}
            onRemove={deleteProjectFile}
          />
          <div className="editor-toolbar">
            <button className={`mobile-files ${projectOpen ? "active" : ""}`} aria-pressed={projectOpen} onClick={() => setProjectOpen((value) => !value)}>
              <Icon name="menu" />
              Project
            </button>
            <button className="mobile-import" disabled={isReadOnly || Boolean(importProgress)} onClick={() => importInput.current?.click()}>
              <Icon name="upload" />
              Import
            </button>
            <LanguagePicker
              value={language}
              languages={languages}
              disabled={isReadOnly || Boolean(importProgress)}
              onChange={(value) => session.codeFileMeta.set(activeFileId, {
                ...(activeMeta || { name: "untitled", createdBy: localName, createdAt: Date.now() }),
                language: value,
              })}
            />
            <span className="toolbar-separator" />
            <span className="privacy-state">
              <Icon name={isReadOnly ? "eye" : session.locked ? "lock" : "shield"} />
              {isReadOnly ? "Read-only invite" : session.locked ? "Password protected" : "WebRTC encrypted"}
            </span>
            <div className="mobile-editor-actions">
              <button className={filesOpen ? "active" : ""} onClick={() => setFilesOpen(true)} aria-label="Share files" aria-pressed={filesOpen}><Icon name="attachment" /></button>
              <button className={runnerOpen ? "active" : ""} onClick={() => setRunnerOpen((value) => !value)} aria-label="Run code" aria-pressed={runnerOpen}><Icon name="play" /></button>
              <button className={activityOpen ? "active" : ""} onClick={() => setActivityOpen(true)} aria-label="Version logs" aria-pressed={activityOpen}><Icon name="history" /></button>
              <button className={reviewOpen ? "active" : ""} onClick={() => setReviewOpen(true)} aria-label="Code review" aria-pressed={reviewOpen}><Icon name="review" /></button>
              <button onClick={openCall} aria-label="Room call"><Icon name="video" /></button>
              <button className={publishOpen ? "active" : ""} onClick={() => setPublishOpen(true)} aria-label="Publish code" aria-pressed={publishOpen}><Icon name="publish" /></button>
            </div>
            <span className="toolbar-spacer" />
            <button className="toolbar-action" disabled={isReadOnly || Boolean(importProgress)} onClick={() => importInput.current?.click()} title="Import a code or text file into the collaborative editor">
              <Icon name="upload" /> Import code
            </button>
            <button className={`toolbar-action ${workbenchOpen ? "active" : ""}`} aria-pressed={workbenchOpen} onClick={() => setWorkbenchOpen((value) => !value)} title="Analyze, format and safely preview">
              <Icon name="braces" /> Workbench
            </button>
            <button className="toolbar-action" onClick={createNewRoom} title="Create a new room">
              <Icon name="new" /> New
            </button>
            <button className="toolbar-action" onClick={clearDocument} disabled={!activeText?.length || Boolean(importProgress)} title="Clear editor">
              <Icon name="trash" /> Clear
            </button>
          </div>
          <CodeEditor
            text={activeText!}
            language={language}
            dark={dark}
            fontSize={fontSize}
            lineWrap={lineWrap}
            themeMode={editorTheme}
            tabSize={tabSize}
            keyBinding={keyBinding}
            minimap={minimap}
            readOnly={isReadOnly}
            largeDocument={(activeText?.length || 0) > LARGE_DOCUMENT_THRESHOLD}
            logs={session.logs}
            peerId={session.mesh.peerId}
            author={localName}
            authorColor={localColor}
          />
          {importProgress && (
            <div className="import-progress" role="status" aria-live="polite">
              <div>
                <strong>
                  {importProgress.phase === "reading" && "Importing "}
                  {importProgress.phase === "syncing" && "Syncing "}
                  {importProgress.phase === "verifying" && "Verifying "}
                  {importProgress.phase === "saving" && "Saving "}
                  {importProgress.name}
                </strong>
                <span>
                  {importProgress.percent}% · {(importProgress.bytes / 1024 / 1024).toFixed(1)} MB ·{" "}
                  {importProgress.lines.toLocaleString()} lines
                </span>
              </div>
              <progress max="100" value={importProgress.percent} />
              {importProgress.phase === "reading" && (
                <button className="text-button danger-text" onClick={() => { importCancelled.current = true; }}>Cancel</button>
              )}
            </div>
          )}
          <RunnerPanel
            open={runnerOpen}
            language={language}
            result={session.runner.get("result") as RunResult | undefined}
            endpoint={judgeEndpoint}
            onEndpointChange={(value) => {
              setJudgeEndpoint(value);
              localStorage.setItem("sharecode:judge0-endpoint", value);
            }}
            onRun={(stdin) => void runCode(stdin)}
            onClose={() => setRunnerOpen(false)}
          />
          <footer className="editor-statusbar">
            <span className={`network-state ${online ? "online" : "offline"}`}>
              <span />
              {online ? "Ready for peers" : "Offline editing"}
            </span>
            <span>{stats.lines} {stats.lines === 1 ? "line" : "lines"}</span>
            <span>{stats.words} {stats.words === 1 ? "word" : "words"}</span>
            <span>{stats.characters} characters</span>
            <span>{(totalProjectSize / 1024 / 1024).toFixed(2)} MB project</span>
            <span className="status-spacer" />
            <span>{recovery ? "Saved locally" : "Ephemeral"}</span>
            {otherTabs > 0 && <span>{saveLeader ? "Primary save tab" : "Synced tab"}</span>}
          </footer>
        </main>
        {activeProjectFile && (
          <WorkbenchPanel
            open={workbenchOpen}
            files={projectFiles}
            activeFile={activeProjectFile}
            report={analysisReport}
            analyzing={analyzing}
            onAnalyze={() => void runAnalysis()}
            onFormat={() => void formatActiveFile()}
            onApplyText={(value) => {
              if (isReadOnly || !activeText) return;
              session.doc.transact(() => {
                if (activeText.length) activeText.delete(0, activeText.length);
                if (value) activeText.insert(0, value);
              }, "utility");
            }}
            onClose={() => setWorkbenchOpen(false)}
          />
        )}
        <ChatPanel
          open={chatOpen}
          messages={session.messages.toArray()}
          peers={allPresence}
          localPeerId={session.mesh.peerId}
          onSend={sendChatMessage}
          onClose={() => setChatOpen(false)}
        />
        <ActivityPanel
          open={activityOpen}
          logs={session.logs.toArray()}
          onClose={() => setActivityOpen(false)}
          onClear={() => {
            if (window.confirm("Clear the shared version log for every peer?")) {
              session.logs.delete(0, session.logs.length);
            }
          }}
        />
        <ReviewPanel
          open={reviewOpen}
          entries={session.reviews.toArray()}
          peers={allPresence}
          onClose={() => setReviewOpen(false)}
          onAdd={(body, kind, lineNumber, parent) => {
            const threadId = parent?.threadId || crypto.randomUUID();
            session.reviews.push([{
              id: crypto.randomUUID(),
              threadId,
              parentId: parent?.id,
              kind,
              author: localName,
              peerId: session.mesh.peerId,
              body,
              line: lineNumber,
              createdAt: Date.now(),
            }]);
          }}
          onReact={(target, emoji) => session.reviews.push([{
            id: crypto.randomUUID(),
            threadId: target.threadId,
            parentId: target.id,
            kind: "reaction",
            author: localName,
            peerId: session.mesh.peerId,
            body: emoji,
            createdAt: Date.now(),
          }])}
        />
        <PublishPanel
          open={publishOpen}
          files={(publishOpen ? [...session.codeFiles.entries()] : []).map(([id, content]) => ({
            name: session.codeFileMeta.get(id)?.name || `${id}.txt`,
            content: content.toString(),
          }))}
          description={session.description.toString()}
          visibility={(session.meta.get("visibility") as "public" | "unlisted" | "private") || "private"}
          source={session.meta.get("source") as { url: string; branch: string; commit: string } | undefined}
          onClose={() => setPublishOpen(false)}
          onDescriptionChange={(value) => {
            session.doc.transact(() => {
              if (session.description.length) session.description.delete(0, session.description.length);
              if (value) session.description.insert(0, value);
            });
          }}
          onVisibilityChange={(value) => session.meta.set("visibility", value)}
          onSourceChange={(source) => session.meta.set("source", source)}
          onImport={(incoming) => {
            let first = "";
            session.doc.transact(() => {
              for (const file of incoming) {
                const id = crypto.randomUUID();
                const content = new Y.Text();
                content.insert(0, file.content);
                session.codeFiles.set(id, content);
                session.codeFileMeta.set(id, {
                  name: file.name,
                  language: languageFromFilename(file.name),
                  createdBy: localName,
                  createdAt: Date.now(),
                });
                if (!first) first = id;
              }
            });
            if (first) setActiveFileId(first);
            showToast(`${incoming.length} repository files imported`);
          }}
        />
        {dragActive && (
          <div className="drop-overlay">
            <span><Icon name="upload" /></span>
            <strong>Drop files to share</strong>
            <small>Any file type, up to 1 GB each</small>
          </div>
        )}
      </div>

      <nav className="mobile-nav" aria-label="Room actions">
        <button className={projectOpen ? "active" : ""} aria-pressed={projectOpen} onClick={() => setProjectOpen((value) => !value)}><Icon name="folder" /><span>Project</span></button>
        <button className={chatOpen ? "active" : ""} aria-pressed={chatOpen} onClick={() => setChatOpen((value) => !value)}><Icon name="chat" /><span>Chat</span></button>
        <button className="mobile-share" onClick={() => setShareOpen(true)}><Icon name="share" /><span>Share</span></button>
        <button onClick={exportDocument}><Icon name="download" /><span>Save</span></button>
        <button onClick={() => setSecurityOpen(true)}><Icon name="settings" /><span>Settings</span></button>
        <button className={filesOpen ? "active" : ""} aria-pressed={filesOpen} onClick={() => setFilesOpen((value) => !value)}><Icon name="attachment" /><span>Files</span></button>
      </nav>

      <CallPanel
        open={callOpen}
        localStream={localStream}
        remoteStreams={remoteStreams}
        peers={allPresence}
        mode={callMode}
        muted={muted}
        cameraOff={cameraOff}
        onStart={(mode) => void startCall(mode)}
        onToggleMute={() => {
          const next = !muted;
          localStream?.getAudioTracks().forEach((track) => { track.enabled = !next; });
          setMuted(next);
        }}
        onToggleCamera={() => {
          const next = !cameraOff;
          localStream?.getVideoTracks().forEach((track) => { track.enabled = !next; });
          setCameraOff(next);
        }}
        onLeave={leaveCall}
        onClose={() => setCallOpen(false)}
      />

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        roomUrl={roomUrl(session.roomId)}
        inviteLink={inviteLink}
        answer={answerToken}
        joining={Boolean(boot?.inviteToken)}
        busy={shareBusy}
        error={shareError}
        peerCount={peerCount}
        onCreateInvite={(access) => void createInvite(access)}
        onAcceptAnswer={(answer) => void acceptAnswer(answer)}
        onJoin={() => void joinInvite()}
      />

      <Dialog
        open={onboardingOpen}
        closeable={false}
        title={boot?.inviteToken ? "You’ve been invited" : "Welcome to p2p-share"}
        description={
          boot?.inviteToken
            ? "Choose the name your peers will see before joining the room."
            : "Choose a display name for collaboration and group chat."
        }
      >
        <div className="dialog-body stack onboarding">
          <div className="onboarding-visual">
            <span><Icon name="users" /></span>
            <div><strong>Live, private collaboration</strong><small>Your name stays in this browser session.</small></div>
          </div>
          <div className="field-group">
            <label htmlFor="onboarding-name">Your display name</label>
            <input
              id="onboarding-name"
              autoFocus
              maxLength={32}
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && completeOnboarding()}
              placeholder="e.g. Alex"
            />
          </div>
          <button className="primary-button" onClick={completeOnboarding}>
            <Icon name={boot?.inviteToken ? "users" : "chevron"} />
            {boot?.inviteToken ? "Continue to invitation" : "Enter workspace"}
          </button>
          {onboardingError && <p className="form-error" role="alert">{onboardingError}</p>}
        </div>
      </Dialog>

      <Dialog
        open={securityOpen}
        onClose={() => setSecurityOpen(false)}
        title="Settings & privacy"
        description="Personalize the editor and control what this browser stores."
      >
        <div className="dialog-body stack">
          <div className="settings-section">
            <span className="section-label">Your experience</span>
            <div className="field-group">
              <label htmlFor="display-name">Display name</label>
              <input
                id="display-name"
                maxLength={32}
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
              />
            </div>
            <div className="preference-grid">
              <div className="field-group">
                <label htmlFor="font-size">Editor text</label>
                <select
                  id="font-size"
                  value={fontSize}
                  onChange={(event) => setFontSize(Number(event.target.value))}
                >
                  <option value="12">Small</option>
                  <option value="14">Medium</option>
                  <option value="16">Large</option>
                  <option value="18">Extra large</option>
                  <option value="20">Maximum</option>
                </select>
              </div>
              <div className="setting-row compact">
                <div>
                  <strong>Wrap long lines</strong>
                  <span>Fit code to narrow screens.</span>
                </div>
                <button
                  className={`toggle ${lineWrap ? "on" : ""}`}
                  role="switch"
                  aria-checked={lineWrap}
                  onClick={() => setLineWrap((value) => !value)}
                >
                  <span />
                </button>
              </div>
              <div className="field-group">
                <label htmlFor="editor-theme">Editor theme</label>
                <select id="editor-theme" value={editorTheme} onChange={(event) => setEditorTheme(event.target.value as typeof editorTheme)}>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="contrast">High contrast</option>
                </select>
              </div>
              <div className="field-group">
                <label htmlFor="tab-size">Tab size</label>
                <select id="tab-size" value={tabSize} onChange={(event) => setTabSize(Number(event.target.value))}>
                  <option value="2">2 spaces</option>
                  <option value="4">4 spaces</option>
                  <option value="8">8 spaces</option>
                </select>
              </div>
              <div className="field-group">
                <label htmlFor="keybinding">Keybindings</label>
                <select id="keybinding" value={keyBinding} onChange={(event) => setKeyBinding(event.target.value as typeof keyBinding)}>
                  <option value="standard">Standard</option>
                  <option value="vim">Vim</option>
                  <option value="emacs">Emacs</option>
                </select>
              </div>
              <div className="setting-row compact">
                <div><strong>Editor minimap</strong><span>Hide automatically for very large files.</span></div>
                <button className={`toggle ${minimap ? "on" : ""}`} role="switch" aria-checked={minimap} onClick={() => setMinimap((value) => !value)}><span /></button>
              </div>
            </div>
          </div>
          <div className="divider"><span>privacy</span></div>
          <div className="setting-row">
            <div>
              <strong>Local recovery</strong>
              <span>Restore this document and its cached files from the same browser.</span>
            </div>
            <button
              className={`toggle ${recovery ? "on" : ""}`}
              role="switch"
              aria-checked={recovery}
              onClick={() => void toggleRecovery()}
            >
              <span />
            </button>
          </div>
          <div className="callout">
            <Icon name="shield" />
            <div>
              <strong>No server copy</strong>
              <span>
                Session data stays in open peers and, when enabled, this browser’s IndexedDB.
              </span>
            </div>
          </div>
          {session.locked ? (
            <>
              <div className="locked-summary"><Icon name="lock" /><span>This room is password protected with AES-256-GCM.</span></div>
              <button className="secondary-button danger-text" onClick={() => void removePassword()}>
                Remove password
              </button>
            </>
          ) : (
            <>
              <div className="field-group">
                <label htmlFor="new-password">New room password</label>
                <input
                  id="new-password"
                  type="password"
                  minLength={8}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="field-group">
                <label htmlFor="confirm-password">Confirm password</label>
                <input
                  id="confirm-password"
                  type="password"
                  value={passwordConfirm}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                />
              </div>
              <button className="primary-button" onClick={() => void applyPassword()}>
                <Icon name="lock" /> Protect room
              </button>
            </>
          )}
          <button
            className="text-button danger-text"
            onClick={async () => {
              await deleteRoom(session.roomId);
              showToast("Local room data cleared");
              setSecurityOpen(false);
            }}
          >
            Clear this room from browser storage
          </button>
          <div className="dialog-actions">
            {installPrompt && (
              <button
                className="secondary-button"
                onClick={async () => {
                  await installPrompt.prompt();
                  const choice = await installPrompt.userChoice;
                  if (choice.outcome === "accepted") {
                    setInstallPrompt(undefined);
                    showToast("p2p-share installed");
                  }
                }}
              >
                <Icon name="install" /> Install app
              </button>
            )}
            <button className="primary-button" onClick={savePreferences}>
              Save settings
            </button>
          </div>
          {securityError && <p className="form-error" role="alert">{securityError}</p>}
        </div>
      </Dialog>

      <CommandPalette open={commandOpen} commands={commands} onClose={() => setCommandOpen(false)} />
      <FilePreviewDialog
        file={previewFile?.file}
        blob={previewFile?.blob}
        onClose={() => setPreviewFile(undefined)}
        onDownload={() => {
          if (!previewFile) return;
          const url = URL.createObjectURL(previewFile.blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = previewFile.file.name;
          anchor.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
        }}
      />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

async function sendFile(
  session: Session,
  fileId: string,
  transferId: string,
  target: string,
  setTransfers: React.Dispatch<React.SetStateAction<Transfer[]>>,
) {
  const file = await getFile(session.roomId, fileId);
  const meta = session.files.get(fileId);
  if (!file || !meta) {
    await session.mesh.send({ type: "file-error", target, transferId, message: "File is not available." });
    return;
  }
  setTransfers((current) => [
    ...current.filter((item) => item.id !== transferId),
    {
      id: transferId,
      fileId,
      name: meta.name,
      direction: "send",
      transferred: 0,
      total: file.size,
      status: "running",
      startedAt: Date.now(),
    },
  ]);
  try {
    for (let offset = 0, index = 0; offset < file.size; offset += FILE_CHUNK_SIZE, index += 1) {
      const bytes = new Uint8Array(await file.slice(offset, offset + FILE_CHUNK_SIZE).arrayBuffer());
      await session.mesh.send({
        type: "file-chunk",
        target,
        transferId,
        index,
        offset,
        data: bytesToBase64(bytes),
      });
      updateTransfer(setTransfers, transferId, { transferred: offset + bytes.length });
    }
    await session.mesh.send({ type: "file-end", target, transferId });
    updateTransfer(setTransfers, transferId, { status: "done", transferred: file.size });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The file transfer failed.";
    updateTransfer(setTransfers, transferId, { status: "failed", error: message });
    await session.mesh.send({ type: "file-error", target, transferId, message }).catch(() => undefined);
    throw error;
  }
}
