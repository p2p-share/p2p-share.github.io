import { createSalt, decryptBytes, deriveRoomKey, encryptBytes } from "../src/lib/crypto";

describe("room encryption", () => {
  it("encrypts and decrypts with the same password", async () => {
    const key = await deriveRoomKey("a strong room password", createSalt());
    const clear = new TextEncoder().encode("private source code");
    const encrypted = await encryptBytes(clear, key);
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.payload).not.toContain("private");
    const decrypted = await decryptBytes(encrypted, key);
    expect(Array.from(decrypted)).toEqual(Array.from(clear));
  });

  it("fails closed with the wrong password", async () => {
    const salt = createSalt();
    const key = await deriveRoomKey("correct password", salt);
    const wrongKey = await deriveRoomKey("incorrect password", salt);
    const encrypted = await encryptBytes(new Uint8Array([1, 2, 3]), key);
    await expect(decryptBytes(encrypted, wrongKey)).rejects.toThrow("Incorrect password");
  });

  it("supports transport-only plaintext rooms", async () => {
    const clear = new Uint8Array([1, 2, 3]);
    const encoded = await encryptBytes(clear);
    expect(encoded.iv).toBeUndefined();
    await expect(decryptBytes(encoded)).resolves.toEqual(clear);
  });
});
