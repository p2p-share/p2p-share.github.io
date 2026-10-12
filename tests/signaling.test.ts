import { describe, expect, it, vi } from "vitest";
import { waitForIceGathering } from "../src/lib/signaling";

type CandidateDetails = Partial<RTCIceCandidate> & {
  relayProtocol?: string;
  url?: string;
};

class FakePeerConnection extends EventTarget {
  iceGatheringState: RTCIceGatheringState = "gathering";
  localDescription: RTCSessionDescription | null = null;

  getConfiguration() {
    return {
      iceServers: [{
        urls: [
          "turn:turn.cloudflare.com:3478?transport=udp",
          "turns:turn.cloudflare.com:443?transport=tcp",
        ],
        username: "short-lived-user",
        credential: "short-lived-credential",
      }],
    };
  }

  emitCandidate(candidate: CandidateDetails) {
    const event = new Event("icecandidate") as RTCPeerConnectionIceEvent;
    Object.defineProperty(event, "candidate", { value: candidate });
    this.dispatchEvent(event);
  }
}

describe("non-trickle ICE gathering", () => {
  it("waits past an early UDP relay for a corporate-friendly TCP/TLS relay", async () => {
    vi.useFakeTimers();
    try {
      const connection = new FakePeerConnection();
      let finished = false;
      const gathering = waitForIceGathering(
        connection as unknown as RTCPeerConnection,
        12_000,
      ).then(() => { finished = true; });

      connection.emitCandidate({
        type: "relay",
        protocol: "udp",
        relayProtocol: "udp",
        url: "turn:turn.cloudflare.com:3478?transport=udp",
      });
      await vi.advanceTimersByTimeAsync(1_000);
      expect(finished).toBe(false);

      connection.emitCandidate({
        type: "relay",
        protocol: "udp",
        relayProtocol: "tls",
        url: "turns:turn.cloudflare.com:443?transport=tcp",
      });
      await vi.advanceTimersByTimeAsync(249);
      expect(finished).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await gathering;
      expect(finished).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still completes at the bound when a network exposes no TCP/TLS relay", async () => {
    vi.useFakeTimers();
    try {
      const connection = new FakePeerConnection();
      let finished = false;
      const gathering = waitForIceGathering(
        connection as unknown as RTCPeerConnection,
        12_000,
      ).then(() => { finished = true; });

      connection.emitCandidate({ type: "relay", protocol: "udp", relayProtocol: "udp" });
      await vi.advanceTimersByTimeAsync(11_999);
      expect(finished).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await gathering;
      expect(finished).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
