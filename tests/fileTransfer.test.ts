import {
  chunkDigest,
  createTransferKey,
  decryptTransferChunk,
  encryptTransferChunk,
  exportTransferKey,
  importTransferKey,
  streamBlobChunks,
  transferDigest,
} from "../src/lib/fileTransfer";

describe("encrypted direct file transfer", () => {
  it("encrypts, authenticates, and decrypts a binary chunk", async () => {
    const senderKey = await createTransferKey();
    const receiverKey = await importTransferKey(await exportTransferKey(senderKey));
    const clear = crypto.getRandomValues(new Uint8Array(60 * 1024));
    const encrypted = await encryptTransferChunk(clear, senderKey, "transfer-1", 0);

    expect(encrypted.payload).not.toEqual(clear);
    await expect(
      decryptTransferChunk(encrypted.payload, encrypted.iv, receiverKey, "transfer-1", 0),
    ).resolves.toEqual(clear);
    await expect(
      decryptTransferChunk(encrypted.payload, encrypted.iv, receiverKey, "transfer-1", 1),
    ).rejects.toThrow("failed authentication");
  });

  it("produces an order-sensitive transfer digest", async () => {
    const first = await chunkDigest(new TextEncoder().encode("first"));
    const second = await chunkDigest(new TextEncoder().encode("second"));

    expect(await transferDigest([first, second])).not.toBe(await transferDigest([second, first]));
    expect(await transferDigest([first, second])).toBe(await transferDigest([first, second]));
  });

  it("keeps simultaneous peer streams cryptographically independent", async () => {
    const payload = crypto.getRandomValues(new Uint8Array(32 * 1024));
    const transfers = await Promise.all(Array.from({ length: 4 }, async (_, index) => {
      const key = await createTransferKey();
      const encrypted = await encryptTransferChunk(payload, key, `peer-transfer-${index}`, 0);
      const clear = await decryptTransferChunk(
        encrypted.payload,
        encrypted.iv,
        key,
        `peer-transfer-${index}`,
        0,
      );
      return { encrypted, clear };
    }));

    expect(transfers.every(({ clear }) => clear.every((value, index) => value === payload[index]))).toBe(true);
    expect(new Set(transfers.map(({ encrypted }) => encrypted.iv)).size).toBe(4);
  });

  it("streams a device-backed blob in bounded ordered chunks", async () => {
    const source = new Uint8Array(210_123);
    for (let offset = 0; offset < source.length; offset += 65_536) {
      crypto.getRandomValues(source.subarray(offset, Math.min(offset + 65_536, source.length)));
    }
    const chunks: Uint8Array[] = [];
    for await (const chunk of streamBlobChunks(new Blob([source]), 60 * 1024)) chunks.push(chunk);

    expect(chunks.slice(0, -1).every((chunk) => chunk.length === 60 * 1024)).toBe(true);
    expect(Math.max(...chunks.map((chunk) => chunk.length))).toBeLessThanOrEqual(60 * 1024);
    const restored = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      restored.set(chunk, offset);
      offset += chunk.length;
    }
    expect(restored).toEqual(source);
  });
});
