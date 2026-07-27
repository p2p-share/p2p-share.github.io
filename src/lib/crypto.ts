import { base64ToBytes, bytesToBase64 } from "./encoding";

export type CipherPayload = { payload: string; iv?: string };

export async function deriveRoomKey(password: string, saltBase64: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: base64ToBytes(saltBase64),
      iterations: 250_000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function createSalt(): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function encryptBytes(bytes: Uint8Array, key?: CryptoKey): Promise<CipherPayload> {
  if (!key) return { payload: bytesToBase64(bytes) };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes);
  return { payload: bytesToBase64(new Uint8Array(encrypted)), iv: bytesToBase64(iv) };
}

export async function decryptBytes(cipher: CipherPayload, key?: CryptoKey): Promise<Uint8Array> {
  const payload = base64ToBytes(cipher.payload);
  if (!cipher.iv) return payload;
  if (!key) throw new Error("A password is required to decrypt this room.");
  try {
    const clear = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBytes(cipher.iv) },
      key,
      payload,
    );
    return new Uint8Array(clear);
  } catch {
    throw new Error("Incorrect password or corrupted room data.");
  }
}
