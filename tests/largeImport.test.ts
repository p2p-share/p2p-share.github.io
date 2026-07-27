import { streamUtf8Blob } from "../src/lib/largeImport";

describe("large file streaming import", () => {
  it("imports every character across UTF-8 and surrogate boundaries", async () => {
    const line = "const greeting = 'नमस्ते 🌍';\n";
    const expected = line.repeat(20_000);
    const chunks: string[] = [];

    const result = await streamUtf8Blob(new Blob([expected]), {
      chunkCharacters: 64 * 1024,
      onChunk: (value) => { chunks.push(value); },
    });

    expect(chunks.join("")).toBe(expected);
    expect(result.bytesRead).toBe(new Blob([expected]).size);
    expect(result.characters).toBe(expected.length);
    expect(result.lines).toBe(20_001);
    expect(result.chunks).toBeGreaterThan(1);
  });

  it("stops cleanly when an import is cancelled", async () => {
    let chunks = 0;
    await expect(streamUtf8Blob(new Blob(["a".repeat(300_000)]), {
      chunkCharacters: 64 * 1024,
      isCancelled: () => chunks === 1,
      onChunk: () => { chunks += 1; },
    })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("counts and consumes a million-line file without whole-file decoding", async () => {
    const source = new Blob(["x\n".repeat(1_000_000)]);
    let insertedCharacters = 0;
    const result = await streamUtf8Blob(source, {
      chunkCharacters: 128 * 1024,
      onChunk: (value) => { insertedCharacters += value.length; },
    });

    expect(result.bytesRead).toBe(source.size);
    expect(result.lines).toBe(1_000_001);
    expect(result.characters).toBe(2_000_000);
    expect(insertedCharacters).toBe(result.characters);
  });
});
