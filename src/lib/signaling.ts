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

export function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 15_000): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = window.setTimeout(done, timeoutMs);
    function done() {
      window.clearTimeout(timeout);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    }
    function check() {
      if (pc.iceGatheringState === "complete") done();
    }
    pc.addEventListener("icegatheringstatechange", check);
  });
}
