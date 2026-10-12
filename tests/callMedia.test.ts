import { describe, expect, it } from "vitest";
import { callTracks, mediaCaptureMessage } from "../src/lib/callMedia";

function source(audio: unknown[] = [], video: unknown[] = []) {
  return {
    getAudioTracks: () => audio,
    getVideoTracks: () => video,
  } as unknown as MediaStream;
}

describe("call media", () => {
  it("keeps the microphone while replacing the camera with a presentation", () => {
    const microphone = { kind: "audio" };
    const camera = { kind: "video", label: "camera" };
    const screen = { kind: "video", label: "screen" };

    expect(callTracks(source([microphone], [camera]), source([], [screen]))).toEqual([microphone, screen]);
  });

  it("uses at most one audio and one video track", () => {
    expect(callTracks(source([1, 2]), source([], [3, 4]))).toEqual([1, 3]);
  });

  it("turns browser permission failures into useful guidance", () => {
    expect(mediaCaptureMessage(new DOMException("denied", "NotAllowedError"), "call"))
      .toContain("permission was denied");
    expect(mediaCaptureMessage(new DOMException("denied", "NotAllowedError"), "screen"))
      .toContain("cancelled or blocked");
  });
});
