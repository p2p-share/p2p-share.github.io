import { decodeToken, encodeToken } from "./encoding";
import type { AccessMode } from "../types";

export type InviteToken = {
  v: 1;
  kind: "invite";
  roomId: string;
  offerId: string;
  inviter: string;
  locked: boolean;
  access?: AccessMode;
  salt?: string;
  description: RTCSessionDescriptionInit;
};

export type AnswerToken = {
  v: 1;
  kind: "answer";
  roomId: string;
  offerId: string;
  responder: string;
  description: RTCSessionDescriptionInit;
};

export const encodeSignal = (signal: InviteToken | AnswerToken) => encodeToken(signal);

const isCorporateRelayCandidate = (candidate: RTCIceCandidate) => {
  if (candidate.type !== "relay") return false;
  // These fields are implemented by current browsers but are missing from
  // some TypeScript DOM library versions supported by the project.
  const details = candidate as RTCIceCandidate & {
    relayProtocol?: string;
    url?: string;
  };
  const relayProtocol = String(details.relayProtocol || "").toLowerCase();
  const url = String(details.url || "").toLowerCase();
  return candidate.protocol === "tcp"
    || relayProtocol === "tcp"
    || relayProtocol === "tls"
    || /^turns:/.test(url)
    || /[?&]transport=tcp(?:&|$)/.test(url);
};

export async function decodeSignal(token: string): Promise<InviteToken | AnswerToken> {
  const value = await decodeToken<InviteToken | AnswerToken>(token.trim());
  if (value.v !== 1 || !["invite", "answer"].includes(value.kind)) {
    throw new Error("This is not a valid p2p-share invite or answer.");
  }
  return value;
}

export function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 12_000): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  const hasTurn = pc.getConfiguration().iceServers?.some((server) =>
    (Array.isArray(server.urls) ? server.urls : [server.urls])
      .some((url) => /^turns?:/i.test(url)),
  );
  const preferredType = hasTurn ? "relay" : "srflx";
  if (pc.localDescription?.sdp?.includes(` typ ${preferredType}`)) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = window.setTimeout(done, timeoutMs);
    let settle: number | undefined;
    function done() {
      window.clearTimeout(timeout);
      if (settle) window.clearTimeout(settle);
      pc.removeEventListener("icegatheringstatechange", check);
      pc.removeEventListener("icecandidate", candidate);
      resolve();
    }
    function check() {
      if (pc.iceGatheringState === "complete") done();
    }
    function candidate(event: RTCPeerConnectionIceEvent) {
      if (event.candidate?.type !== preferredType || settle) return;
      // UDP relay candidates usually arrive first but are commonly blocked by
      // corporate VPNs. Keep gathering until a TURN-over-TCP/TLS route is in
      // the non-trickle SDP, then briefly allow parallel allocations to join.
      if (hasTurn && !isCorporateRelayCandidate(event.candidate)) return;
      settle = window.setTimeout(done, 250);
    }
    pc.addEventListener("icegatheringstatechange", check);
    pc.addEventListener("icecandidate", candidate);
  });
}
