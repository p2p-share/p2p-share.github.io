import type { RoomRecord } from "../types";

const DB_NAME = "sharecode";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("rooms")) db.createObjectStore("rooms", { keyPath: "roomId" });
      if (!db.objectStoreNames.contains("files")) db.createObjectStore("files", { keyPath: "key" });
      if (!db.objectStoreNames.contains("chunks")) db.createObjectStore("chunks", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getRoom(roomId: string): Promise<RoomRecord | undefined> {
  const db = await openDb();
  return requestResult(db.transaction("rooms", "readonly").objectStore("rooms").get(roomId));
}

export async function putRoom(room: RoomRecord): Promise<void> {
  const db = await openDb();
  await requestResult(db.transaction("rooms", "readwrite").objectStore("rooms").put(room));
}

export async function putFile(roomId: string, fileId: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await requestResult(
    db.transaction("files", "readwrite").objectStore("files").put({
      key: `${roomId}:${fileId}`,
      roomId,
      fileId,
      blob,
    }),
  );
}

export async function getFile(roomId: string, fileId: string): Promise<Blob | undefined> {
  const db = await openDb();
  const result = await requestResult<any>(
    db.transaction("files", "readonly").objectStore("files").get(`${roomId}:${fileId}`),
  );
  return result?.blob;
}

export async function putChunk(
  roomId: string,
  transferId: string,
  index: number,
  bytes: Uint8Array,
): Promise<void> {
  const db = await openDb();
  await requestResult(
    db.transaction("chunks", "readwrite").objectStore("chunks").put({
      key: `${roomId}:${transferId}:${index.toString().padStart(8, "0")}`,
      roomId,
      transferId,
      index,
      bytes,
    }),
  );
}

export async function finishChunks(
  roomId: string,
  transferId: string,
  fileId: string,
  type: string,
): Promise<Blob> {
  const db = await openDb();
  const all = await requestResult<any[]>(
    db.transaction("chunks", "readonly").objectStore("chunks").getAll(),
  );
  const matching = all
    .filter((entry) => entry.roomId === roomId && entry.transferId === transferId)
    .sort((a, b) => a.index - b.index);
  const blob = new Blob(
    matching.map((entry) => entry.bytes),
    { type },
  );
  await putFile(roomId, fileId, blob);
  const tx = db.transaction("chunks", "readwrite");
  for (const entry of matching) tx.objectStore("chunks").delete(entry.key);
  return blob;
}

export async function deleteRoom(roomId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(["rooms", "files", "chunks"], "readwrite");
  tx.objectStore("rooms").delete(roomId);
  for (const storeName of ["files", "chunks"]) {
    const store = tx.objectStore(storeName);
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (cursor.value.roomId === roomId) cursor.delete();
      cursor.continue();
    };
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
