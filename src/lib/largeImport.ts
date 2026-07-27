export type StreamImportProgress = {
  bytesRead: number;
  characters: number;
  chunks: number;
  lines: number;
};

export type StreamImportOptions = {
  chunkCharacters?: number;
  isCancelled?: () => boolean;
  onChunk: (value: string, progress: StreamImportProgress) => void | Promise<void>;
  onProgress?: (progress: StreamImportProgress) => void;
};

const DEFAULT_CHUNK_CHARACTERS = 1024 * 1024;

function newlineCount(value: string) {
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) === 10) count += 1;
  }
  return count;
}

function safeCut(value: string, requested: number) {
  let cut = Math.min(requested, value.length);
  if (cut > 0 && cut < value.length) {
    const previous = value.charCodeAt(cut - 1);
    if (previous >= 0xd800 && previous <= 0xdbff) cut -= 1;
  }
  return cut;
}

function blobArrayBuffer(source: Blob) {
  if (typeof source.arrayBuffer === "function") return source.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Could not read the selected file."));
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(source);
  });
}

/**
 * Decodes a UTF-8 Blob incrementally without ever calling text() or arrayBuffer()
 * for the complete file. Chunk callbacks are awaited to provide natural
 * backpressure to storage and peer transports.
 */
export async function streamUtf8Blob(
  source: Blob,
  options: StreamImportOptions,
): Promise<StreamImportProgress> {
  const chunkCharacters = Math.max(64 * 1024, options.chunkCharacters || DEFAULT_CHUNK_CHARACTERS);
  const stream = typeof source.stream === "function" ? source.stream() : undefined;
  const reader = stream?.getReader();
  let fallbackOffset = 0;
  const readNext = async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
    if (reader) return reader.read();
    if (fallbackOffset >= source.size) return { done: true, value: undefined };
    const end = Math.min(source.size, fallbackOffset + 256 * 1024);
    const value = new Uint8Array(await blobArrayBuffer(source.slice(fallbackOffset, end)));
    fallbackOffset = end;
    return { done: false, value };
  };
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let buffer = "";
  let progress: StreamImportProgress = {
    bytesRead: 0,
    characters: 0,
    chunks: 0,
    lines: 1,
  };

  const append = async (value: string) => {
    if (!value) return;
    progress = {
      ...progress,
      characters: progress.characters + value.length,
      chunks: progress.chunks + 1,
      lines: progress.lines + newlineCount(value),
    };
    await options.onChunk(value, progress);
    options.onProgress?.(progress);
  };
  const assertNotCancelled = () => {
    if (options.isCancelled?.()) {
      throw new DOMException("Import cancelled.", "AbortError");
    }
  };

  try {
    while (true) {
      assertNotCancelled();
      const { done, value } = await readNext();
      if (done) break;
      progress = { ...progress, bytesRead: progress.bytesRead + value.byteLength };
      buffer += decoder.decode(value, { stream: true });
      while (buffer.length >= chunkCharacters) {
        assertNotCancelled();
        const cut = safeCut(buffer, chunkCharacters);
        const chunk = buffer.slice(0, cut);
        buffer = buffer.slice(cut);
        await append(chunk);
      }
    }
    buffer += decoder.decode();
    assertNotCancelled();
    await append(buffer);
  } catch (error) {
    await reader?.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader?.releaseLock();
  }

  if (progress.bytesRead !== source.size) {
    throw new Error(`Import ended early (${progress.bytesRead} of ${source.size} bytes read).`);
  }
  return progress;
}
