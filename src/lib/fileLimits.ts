export const GIB = 1024 ** 3;
export const MAX_SHARED_FILE_SIZE = 10 * GIB;
export const MAX_BUFFERED_DOWNLOAD_SIZE = 256 * 1024 ** 2;

export function sharedFileSizeError(size: number) {
  if (!Number.isSafeInteger(size) || size < 0) return "The file has an invalid size.";
  if (size > MAX_SHARED_FILE_SIZE) return "Files must be 10 GB or smaller.";
  return undefined;
}

export function expectedTransferChunks(fileSize: number, chunkSize: number) {
  if (!Number.isSafeInteger(fileSize) || fileSize < 0) return undefined;
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) return undefined;
  return Math.ceil(fileSize / chunkSize);
}
