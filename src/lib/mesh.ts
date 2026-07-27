import { decryptBytes, encryptBytes } from "./crypto";
import { decodeJson, encodeJson } from "./encoding";
import {
  decodeSignal,
  encodeSignal,
  type AnswerToken,
  type InviteToken,
  waitForIceGathering,
} from "./signaling";

type NetworkEnvelope = {
  id: string;
  origin: string;
  body: Record<string, unknown>;
};

type Fragment = {
  m: string;
  i: number;
  n: number;
  payload: string;
  iv?: string;
};

type Link = {
  id: string;
  pc: RTCPeerConnection;
  channel?: RTCDataChannel;
  remotePeerId?: string;
};

type PendingMessage = {
  parts: Array<Uint8Array | undefined>;
  received: number;
};

type MeshEvents = {
  message: CustomEvent<NetworkEnvelope>;
  peers: CustomEvent<number>;
  error: CustomEvent<string>;
};

const MAX_FRAGMENT = 24 * 1024;
const HIGH_WATER = 2 * 1024 * 1024;

export class PeerMesh extends EventTarget {
  readonly peerId = crypto.randomUUID();
  private links = new Map<string, Link>();
  private offers = new Map<string, Link>();
  private seen = new Set<string>();
  private pending = new Map<string, PendingMessage>();
  private key?: CryptoKey;

  constructor(
    readonly roomId: string,
    key?: CryptoKey,
  ) {
    super();
    this.key = key;
  }

  setKey(key?: CryptoKey) {
    this.key = key;
  }

  get peerCount() {
    return [...this.links.values()].filter((link) => link.channel?.readyState === "open").length;
  }

  on<K extends keyof MeshEvents>(event: K, listener: (event: MeshEvents[K]) => void) {
    this.addEventListener(event, listener as EventListener);
    return () => this.removeEventListener(event, listener as EventListener);
  }

  private createConnection(id: string): Link {
    // No STUN/TURN is intentional: host candidates keep signaling fully infrastructure-free.
    const pc = new RTCPeerConnection({ iceServers: [] });
    const link: Link = { id, pc };
    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
        this.links.delete(id);
        this.dispatchEvent(new CustomEvent("peers", { detail: this.peerCount }));
        if (pc.connectionState === "failed") {
          this.dispatchEvent(
            new CustomEvent("error", {
              detail:
                "Direct connection failed. The peers may be behind restrictive NAT or firewall rules.",
            }),
          );
        }
      }
    };
    pc.ondatachannel = (event) => this.attachChannel(link, event.channel);
    return link;
  }

  private attachChannel(link: Link, channel: RTCDataChannel) {
    link.channel = channel;
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = 512 * 1024;
    channel.onopen = () => {
      this.links.set(link.id, link);
      void this.send({ type: "hello", peerId: this.peerId });
      this.dispatchEvent(new CustomEvent("peers", { detail: this.peerCount }));
    };
    channel.onmessage = (event) => void this.receiveFragment(link, String(event.data));
    channel.onerror = () =>
      this.dispatchEvent(new CustomEvent("error", { detail: "A peer connection encountered an error." }));
  }

  async createInvite(locked: boolean, salt?: string): Promise<string> {
    const offerId = crypto.randomUUID();
    const link = this.createConnection(offerId);
    const channel = link.pc.createDataChannel("sharecode", { ordered: true });
    this.attachChannel(link, channel);
    await link.pc.setLocalDescription(await link.pc.createOffer());
    await waitForIceGathering(link.pc);
    this.offers.set(offerId, link);
    return encodeSignal({
      v: 1,
      kind: "invite",
      roomId: this.roomId,
      offerId,
      inviter: this.peerId,
      locked,
      salt,
      description: link.pc.localDescription!,
    });
  }

  async acceptInvite(token: string): Promise<string> {
    const signal = await decodeSignal(token);
    if (signal.kind !== "invite" || signal.roomId !== this.roomId) throw new Error("Invite room mismatch.");
    const link = this.createConnection(signal.offerId);
    link.remotePeerId = signal.inviter;
    await link.pc.setRemoteDescription(signal.description);
    await link.pc.setLocalDescription(await link.pc.createAnswer());
    await waitForIceGathering(link.pc);
    this.links.set(link.id, link);
    const answer: AnswerToken = {
      v: 1,
      kind: "answer",
      roomId: this.roomId,
      offerId: signal.offerId,
      responder: this.peerId,
      description: link.pc.localDescription!,
    };
    return encodeSignal(answer);
  }

  async acceptAnswer(token: string): Promise<void> {
    const signal = await decodeSignal(token);
    if (signal.kind !== "answer" || signal.roomId !== this.roomId) throw new Error("Answer room mismatch.");
    const link = this.offers.get(signal.offerId);
    if (!link) throw new Error("This answer does not match an active invite.");
    link.remotePeerId = signal.responder;
    await link.pc.setRemoteDescription(signal.description);
    this.links.set(link.id, link);
    this.offers.delete(signal.offerId);
  }

  async send(body: Record<string, unknown>): Promise<void> {
    const envelope: NetworkEnvelope = {
      id: crypto.randomUUID(),
      origin: this.peerId,
      body,
    };
    this.seen.add(envelope.id);
    this.pruneSeen();
    await this.broadcastEnvelope(envelope);
  }

  private async broadcastEnvelope(envelope: NetworkEnvelope, exceptId?: string) {
    const bytes = encodeJson(envelope);
    const messageId = crypto.randomUUID();
    const count = Math.max(1, Math.ceil(bytes.length / MAX_FRAGMENT));
    for (let i = 0; i < count; i += 1) {
      const part = bytes.subarray(i * MAX_FRAGMENT, (i + 1) * MAX_FRAGMENT);
      const cipher = await encryptBytes(part, this.key);
      const frame = JSON.stringify({ m: messageId, i, n: count, ...cipher } satisfies Fragment);
      const sends = [...this.links.values()]
        .filter((link) => link.id !== exceptId && link.channel?.readyState === "open")
        .map((link) => this.sendFrame(link.channel!, frame));
      await Promise.all(sends);
    }
  }

  private async sendFrame(channel: RTCDataChannel, frame: string) {
    if (channel.bufferedAmount > HIGH_WATER) {
      await new Promise<void>((resolve) => {
        const done = () => {
          channel.removeEventListener("bufferedamountlow", done);
          resolve();
        };
        channel.addEventListener("bufferedamountlow", done, { once: true });
      });
    }
    channel.send(frame);
  }

  private async receiveFragment(link: Link, raw: string) {
    try {
      const frame = JSON.parse(raw) as Fragment;
      const part = await decryptBytes({ payload: frame.payload, iv: frame.iv }, this.key);
      let message = this.pending.get(frame.m);
      if (!message) {
        message = { parts: new Array(frame.n), received: 0 };
        this.pending.set(frame.m, message);
      }
      if (!message.parts[frame.i]) {
        message.parts[frame.i] = part;
        message.received += 1;
      }
      if (message.received !== message.parts.length) return;
      this.pending.delete(frame.m);
      const length = message.parts.reduce((sum, item) => sum + (item?.length ?? 0), 0);
      const joined = new Uint8Array(length);
      let offset = 0;
      for (const item of message.parts) {
        joined.set(item!, offset);
        offset += item!.length;
      }
      const envelope = decodeJson<NetworkEnvelope>(joined);
      if (this.seen.has(envelope.id)) return;
      this.seen.add(envelope.id);
      this.pruneSeen();
      if (envelope.body.type === "hello") link.remotePeerId = String(envelope.body.peerId);
      this.dispatchEvent(new CustomEvent("message", { detail: envelope }));
      await this.broadcastEnvelope(envelope, link.id);
    } catch (error) {
      this.dispatchEvent(
        new CustomEvent("error", {
          detail: error instanceof Error ? error.message : "Could not read an incoming peer message.",
        }),
      );
    }
  }

  private pruneSeen() {
    if (this.seen.size <= 5000) return;
    const keep = [...this.seen].slice(-2500);
    this.seen = new Set(keep);
  }

  disconnect() {
    for (const link of this.links.values()) link.pc.close();
    for (const link of this.offers.values()) link.pc.close();
    this.links.clear();
    this.offers.clear();
    this.dispatchEvent(new CustomEvent("peers", { detail: 0 }));
  }
}

export async function inspectInvite(token: string): Promise<InviteToken> {
  const signal = await decodeSignal(token);
  if (signal.kind !== "invite") throw new Error("Expected an invite link.");
  return signal;
}
