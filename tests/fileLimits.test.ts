import { describe, expect, it } from "vitest";
import {
  GIB,
  MAX_BUFFERED_DOWNLOAD_SIZE,
  MAX_SHARED_FILE_SIZE,
  expectedTransferChunks,
  sharedFileSizeError,
} from "../src/lib/fileLimits";

describe("shared file limits", () => {
  it("accepts files through 10 GB and rejects larger files", () => {
    expect(MAX_SHARED_FILE_SIZE).toBe(10 * GIB);
    expect(sharedFileSizeError(MAX_SHARED_FILE_SIZE)).toBeUndefined();
    expect(sharedFileSizeError(MAX_SHARED_FILE_SIZE + 1)).toContain("10 GB");
  });

  it("keeps the in-memory fallback far below the peer transfer limit", () => {
    expect(MAX_BUFFERED_DOWNLOAD_SIZE).toBeLessThan(MAX_SHARED_FILE_SIZE);
  });

  it("calculates and validates large transfer chunk counts safely", () => {
    expect(expectedTransferChunks(10 * GIB, 256 * 1024)).toBe(40_960);
    expect(expectedTransferChunks(10 * GIB, 0)).toBeUndefined();
    expect(expectedTransferChunks(Number.MAX_SAFE_INTEGER + 1, 64 * 1024)).toBeUndefined();
  });
});
