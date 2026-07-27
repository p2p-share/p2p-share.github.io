import { base64ToBytes, bytesToBase64 } from "./encoding";

const encoder = new TextEncoder();

function chunkAad(transferId: string, index: number) {
  return encoder.encode(`p2p-share:file:v2:${transferId}:${index}`);
}

export async function createTransferKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function exportTransferKey(key: CryptoKey): Promise<string> {
  return bytesToBase64(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
}

export async function importTransferKey(value: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    base64ToBytes(value),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
}

export async function encryptTransferChunk(
  bytes: Uint8Array,
  key: CryptoKey,
  transferId: string,
  index: number,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: chunkAad(transferId, index) },
    key,
    bytes,
  );
  return { payload: new Uint8Array(payload), iv: bytesToBase64(iv) };
}

export async function decryptTransferChunk(
  payload: Uint8Array,
  iv: string,
  key: CryptoKey,
  transferId: string,
  index: number,
) {
  try {
    return new Uint8Array(await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64ToBytes(iv),
        additionalData: chunkAad(transferId, index),
      },
      key,
      payload,
    ));
  } catch {
    throw new Error(`Encrypted file chunk ${index + 1} failed authentication.`);
  }
}

export async function chunkDigest(bytes: Uint8Array): Promise<string> {
  return bytesToBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

export async function transferDigest(chunkDigests: string[]): Promise<string> {
  const combined = new Uint8Array(chunkDigests.length * 32);
  chunkDigests.forEach((digest, index) => combined.set(base64ToBytes(digest), index * 32));
  return bytesToBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", combined)));
}

export async function* streamBlobChunks(blob: Blob, chunkSize: number): AsyncGenerator<Uint8Array> {
  if (typeof blob.stream !== "function") {
    for (let offset = 0; offset < blob.size; offset += chunkSize) {
      const part = blob.slice(offset, offset + chunkSize);
      if (typeof part.arrayBuffer === "function") {
        yield new Uint8Array(await part.arrayBuffer());
      } else {
        yield new Uint8Array(await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(part);
        }));
      }
    }
    return;
  }
  const reader = blob.stream().getReader();
  let pending = new Uint8Array(0);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      let incoming = value;
      if (pending.length) {
        const joined = new Uint8Array(pending.length + incoming.length);
        joined.set(pending);
        joined.set(incoming, pending.length);
        incoming = joined;
        pending = new Uint8Array(0);
      }
      let offset = 0;
      while (incoming.length - offset >= chunkSize) {
        yield incoming.slice(offset, offset + chunkSize);
        offset += chunkSize;
      }
      if (offset < incoming.length) pending = incoming.slice(offset);
    }
    if (pending.length) yield pending;
  } finally {
    reader.releaseLock();
  }
}
