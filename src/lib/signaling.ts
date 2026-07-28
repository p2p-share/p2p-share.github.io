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

export async function decodeSignal(token: string): Promise<InviteToken | AnswerToken> {
  const value = await decodeToken<InviteToken | AnswerToken>(token.trim());
  if (value.v !== 1 || !["invite", "answer"].includes(value.kind)) {
    throw new Error("This is not a valid p2p-share invite or answer.");
  }
  return value;
}

export function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 8_000): Promise<void> {
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
      // Give parallel TCP/TLS allocations a brief window to join the SDP
      // without waiting for every unusable ICE route to time out.
      settle = window.setTimeout(done, 250);
    }
    pc.addEventListener("icegatheringstatechange", check);
    pc.addEventListener("icecandidate", candidate);
  });
}
