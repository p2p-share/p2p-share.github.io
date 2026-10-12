type TrackSource = Pick<MediaStream, "getAudioTracks" | "getVideoTracks">;

export function callTracks(audioSource?: TrackSource, videoSource?: TrackSource) {
  return [
    ...(audioSource?.getAudioTracks().slice(0, 1) ?? []),
    ...(videoSource?.getVideoTracks().slice(0, 1) ?? []),
  ];
}

export function mediaCaptureMessage(error: unknown, action: "call" | "screen") {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return action === "screen"
      ? "Screen sharing was cancelled or blocked by the browser."
      : "Camera or microphone permission was denied. Allow access in your browser and try again.";
  }
  if (name === "NotFoundError") return "No suitable camera or microphone was found.";
  if (name === "NotReadableError") return "The selected device is already in use or unavailable.";
  if (name === "AbortError") return action === "screen" ? "Screen sharing was cancelled." : "Media capture was interrupted.";
  if (error instanceof Error && error.message) return error.message;
  return action === "screen" ? "Screen sharing is not available." : "Camera or microphone access was not available.";
}
