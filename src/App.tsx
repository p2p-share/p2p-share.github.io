import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { CodeEditor, languages } from "./components/CodeEditor";
import { Dialog } from "./components/Dialog";
import { FilesPanel } from "./components/FilesPanel";
import { Icon } from "./components/Icons";
import { ShareDialog } from "./components/ShareDialog";
import { createSalt, decryptBytes, deriveRoomKey, encryptBytes } from "./lib/crypto";
import { deleteRoom, finishChunks, getFile, getRoom, putChunk, putFile, putRoom } from "./lib/db";
import { base64ToBytes, bytesToBase64 } from "./lib/encoding";
import { inspectInvite, PeerMesh } from "./lib/mesh";
import type { InviteToken } from "./lib/signaling";
import type { Presence, RoomRecord, SharedFile, Transfer } from "./types";

type Session = {
  roomId: string;
  doc: Y.Doc;
  text: Y.Text;
  meta: Y.Map<unknown>;
  files: Y.Map<SharedFile>;
  mesh: PeerMesh;
  key?: CryptoKey;
  locked: boolean;
  salt?: string;
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

const MAX_FILE_SIZE = 1024 ** 3;
const FILE_CHUNK_SIZE = 48 * 1024;
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
  const [filesOpen, setFilesOpen] = useState(() => window.innerWidth > 780);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [securityError, setSecurityError] = useState("");
  const [dark, setDark] = useState(() => localStorage.getItem("sharecode:theme") !== "light");
  const [recovery, setRecovery] = useState(true);
  const [revision, setRevision] = useState(0);
  const [peerCount, setPeerCount] = useState(0);
  const [presences, setPresences] = useState<Presence[]>([]);
  const [localFiles, setLocalFiles] = useState<Set<string>>(new Set());
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [toast, setToast] = useState("");
  const bootStarted = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const sinks = useRef(new Map<string, IncomingSink>());
  const localName = useMemo(randomGuestName, []);
  const localColor = useMemo(() => palette[Math.floor(Math.random() * palette.length)], []);

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
      if (!meta.has("name")) meta.set("name", bootState.record?.name || "untitled");
      if (!meta.has("language")) meta.set("language", bootState.record?.language || "javascript");
      const locked = Boolean(bootState.record?.locked || bootState.invite?.locked);
      const salt = bootState.record?.salt || bootState.invite?.salt;
      const mesh = new PeerMesh(bootState.roomId, key);
      const availableIds: string[] = [];
      for (const [id, file] of files.entries()) {
        if (await getFile(bootState.roomId, id)) {
          availableIds.push(id);
          // Peer IDs are intentionally ephemeral, so recovered file ownership follows this tab.
          files.set(id, { ...file, owner: mesh.peerId });
        }
      }
      setLocalFiles(new Set(availableIds));
      setSession({ roomId: bootState.roomId, doc, text, meta, files, mesh, key, locked, salt });
      const recoverySetting = localStorage.getItem(`sharecode:recovery:${bootState.roomId}`) !== "off";
      setRecovery(recoverySetting);
      history.replaceState(null, "", roomUrl(bootState.roomId));
      setReady(true);
      if (bootState.inviteToken) setShareOpen(true);
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
      if (!current || !recovery) return;
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
      if (origin !== "remote") {
        void session.mesh.send({ type: "y-update", update: bytesToBase64(_update) });
      }
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void persist(session), 350);
    };
    session.doc.on("update", scheduleSave);
    session.files.observe(redraw);
    void persist(session);
    return () => {
      session.doc.off("update", scheduleSave);
      session.files.unobserve(redraw);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [persist, session]);

  useEffect(() => {
    if (!session) return;
    const sendPresence = () =>
      void session.mesh.send({
        type: "presence",
        peerId: session.mesh.peerId,
        name: localName,
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
    const heartbeat = window.setInterval(() => {
      sendPresence();
      setPresences((current) => current.filter((item) => Date.now() - item.lastSeen < 45_000));
    }, 15_000);
    return () => {
      offPeers();
      offError();
      offMessage();
      window.clearInterval(heartbeat);
      session.mesh.disconnect();
    };
  }, [localColor, localName, session, showToast]);

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

  const createInvite = async () => {
    if (!session) return;
    setShareBusy(true);
    setShareError("");
    try {
      const token = await session.mesh.createInvite(session.locked, session.salt);
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
    if (!session) return;
    for (const file of Array.from(list)) {
      if (file.size > MAX_FILE_SIZE) {
        showToast(`${file.name} is larger than the 1 GB limit.`);
        continue;
      }
      const id = crypto.randomUUID();
      try {
        await putFile(session.roomId, id, file);
        session.files.set(id, {
          id,
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size,
          owner: session.mesh.peerId,
          addedAt: Date.now(),
        });
        setLocalFiles((current) => new Set(current).add(id));
      } catch (error) {
        showToast(error instanceof Error ? error.message : `Could not add ${file.name}.`);
      }
    }
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
    if (peerCount === 0) {
      showToast("The file owner must be connected before you can request this file.");
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
      },
    ]);
    await session.mesh.send({
      type: "file-request",
      target: file.owner,
      fileId: file.id,
      transferId,
    });
  };

  if (!ready || !session) {
    return (
      <main className="loading-screen">
        <div className="brand-mark"><Icon name="braces" /></div>
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

  const name = String(session.meta.get("name") || "untitled");
  const language = String(session.meta.get("language") || "text");
  const sharedFiles = [...session.files.values()].sort((a, b) => b.addedAt - a.addedAt);
  const allPresence: Presence[] = [
    { peerId: session.mesh.peerId, name: localName, color: localColor, lastSeen: Date.now(), local: true },
    ...presences,
  ];

  return (
    <div className={`app ${dark ? "dark" : "light"}`} data-revision={revision}>
      <header className="topbar">
        <button className="brand" onClick={() => setFilesOpen((value) => !value)} aria-label="Toggle shared files">
          <span className="brand-mark"><Icon name="braces" /></span>
          <span>ShareCode</span>
        </button>
        <div className="document-name">
          <span className="save-dot" title={recovery ? "Saved locally" : "Ephemeral mode"} />
          <input
            aria-label="Document name"
            value={name}
            onChange={(event) => session.meta.set("name", event.target.value)}
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
          <button className="share-button" onClick={() => setShareOpen(true)}>
            <Icon name="share" />
            <span>Share</span>
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
            <Icon name={session.locked ? "lock" : "shield"} />
          </button>
        </div>
      </header>

      <div className="workspace">
        <FilesPanel
          open={filesOpen}
          files={sharedFiles}
          localFiles={localFiles}
          transfers={transfers}
          onUpload={(files) => void uploadFiles(files)}
          onDownload={(file) => void downloadFile(file)}
          onRemove={(file) => session.files.delete(file.id)}
          onClose={() => setFilesOpen(false)}
        />
        <main className="editor-shell">
          <div className="editor-toolbar">
            <button className="mobile-files" onClick={() => setFilesOpen((value) => !value)}>
              <Icon name="menu" />
              Files
            </button>
            <label className="select-wrap">
              <span className="sr-only">Syntax language</span>
              <select value={language} onChange={(event) => session.meta.set("language", event.target.value)}>
                {languages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <span className="toolbar-separator" />
            <span className="privacy-state">
              <Icon name={session.locked ? "lock" : "shield"} />
              {session.locked ? "Password protected" : "WebRTC encrypted"}
            </span>
            <span className="toolbar-spacer" />
            <span className="local-state">{recovery ? "Local recovery on" : "Ephemeral mode"}</span>
          </div>
          <CodeEditor text={session.text} language={language} dark={dark} />
        </main>
      </div>

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        roomUrl={roomUrl(session.roomId)}
        inviteLink={inviteLink}
        answer={answerToken}
        joining={Boolean(boot?.inviteToken)}
        busy={shareBusy}
        error={shareError}
        onCreateInvite={() => void createInvite()}
        onAcceptAnswer={(answer) => void acceptAnswer(answer)}
        onJoin={() => void joinInvite()}
      />

      <Dialog
        open={securityOpen}
        onClose={() => setSecurityOpen(false)}
        title="Privacy & local data"
        description="Control application encryption and whether this browser keeps a recovery copy."
      >
        <div className="dialog-body stack">
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
          {securityError && <p className="form-error" role="alert">{securityError}</p>}
        </div>
      </Dialog>

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
    },
  ]);
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
}
