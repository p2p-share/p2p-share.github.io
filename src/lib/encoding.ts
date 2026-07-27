const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function toBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  return base64ToBytes(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
}

export async function encodeToken(value: unknown): Promise<string> {
  const raw = encoder.encode(JSON.stringify(value));
  if ("CompressionStream" in globalThis && typeof Blob.prototype.stream === "function") {
    const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip"));
    return `z.${toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()))}`;
  }
  return `j.${toBase64Url(raw)}`;
}

export async function decodeToken<T>(token: string): Promise<T> {
  const [format, data] = token.split(".", 2);
  let bytes = fromBase64Url(data);
  if (format === "z") {
    if (
      !("DecompressionStream" in globalThis) ||
      typeof Blob.prototype.stream !== "function"
    ) {
      throw new Error("This browser cannot decompress invite links.");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  } else if (format !== "j") {
    throw new Error("Unsupported invite format.");
  }
  return JSON.parse(decoder.decode(bytes)) as T;
}

export function encodeJson(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value));
}

export function decodeJson<T>(value: Uint8Array): T {
  return JSON.parse(decoder.decode(value)) as T;
}
