import { decryptBytes, encryptBytes } from "./crypto";
import { decodeJson, encodeJson } from "./encoding";
import { recommendedTransferChunkSize } from "./fileTransfer";
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
  direct?: boolean;
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
  remoteStream?: MediaStream;
};

type PendingMessage = {
  parts: Array<Uint8Array | undefined>;
  received: number;
};

type BinaryHeader = {
  id: string;
  origin: string;
  body: Record<string, unknown>;
  direct: true;
};

type MeshEvents = {
  message: CustomEvent<NetworkEnvelope>;
  peers: CustomEvent<number>;
  error: CustomEvent<string>;
  media: CustomEvent<{ peerId: string; stream: MediaStream }>;
  reconnect: CustomEvent<void>;
};

const MAX_FRAGMENT = 24 * 1024;
const HIGH_WATER = 8 * 1024 * 1024;
const LOW_WATER = 2 * 1024 * 1024;
const BINARY_MAGIC = new Uint8Array([0x50, 0x32, 0x50, 0x46]);
export const MAX_DIRECT_PEERS = 16;

export class PeerMesh extends EventTarget {
  readonly peerId = crypto.randomUUID();
  private links = new Map<string, Link>();
  private offers = new Map<string, Link>();
  private seen = new Set<string>();
  private pending = new Map<string, PendingMessage>();
  private key?: CryptoKey;
  private localStream?: MediaStream;

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

  get connectedPeerIds() {
    return [...new Set(
      [...this.links.values()]
        .filter((link) => link.channel?.readyState === "open" && link.remotePeerId)
        .map((link) => link.remotePeerId!),
    )];
  }

  private get routeCount() {
    return new Set(
      [...this.links.values(), ...this.offers.values()]
        .filter((link) => link.pc.connectionState !== "closed")
        .map((link) => link.pc),
    ).size;
  }

  hasPeer(peerId: string) {
    return [...this.links.values(), ...this.offers.values()].some(
      (link) => link.remotePeerId === peerId && link.pc.connectionState !== "closed",
    );
  }

  isPeerConnected(peerId: string) {
    return [...this.links.values()].some(
      (link) => link.remotePeerId === peerId && link.channel?.readyState === "open",
    );
  }

  recommendedFileChunkSize(peerId: string) {
    const link = [...this.links.values()].find(
      (candidate) => candidate.remotePeerId === peerId && candidate.channel?.readyState === "open",
    );
    return recommendedTransferChunkSize(link?.pc.sctp?.maxMessageSize);
  }

  on<K extends keyof MeshEvents>(event: K, listener: (event: MeshEvents[K]) => void) {
    this.addEventListener(event, listener as EventListener);
    return () => this.removeEventListener(event, listener as EventListener);
  }

  private createConnection(id: string): Link {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    const link: Link = { id, pc };
    const audio = pc.addTransceiver("audio", { direction: "sendrecv" });
    const video = pc.addTransceiver("video", { direction: "sendrecv" });
    if (this.localStream) {
      void audio.sender.replaceTrack(this.localStream.getAudioTracks()[0] ?? null);
      void video.sender.replaceTrack(this.localStream.getVideoTracks()[0] ?? null);
    }
    pc.ontrack = (event) => {
      const stream = link.remoteStream ?? new MediaStream();
      link.remoteStream = stream;
      if (!stream.getTracks().some((track) => track.id === event.track.id)) stream.addTrack(event.track);
      const emit = () => {
        if (!link.remotePeerId) return;
        this.dispatchEvent(
          new CustomEvent("media", { detail: { peerId: link.remotePeerId, stream } }),
        );
      };
      event.track.addEventListener("unmute", emit);
      emit();
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(pc.connectionState)) {
        this.links.delete(id);
        this.dispatchEvent(new CustomEvent("peers", { detail: this.peerCount }));
        if (pc.connectionState === "failed") {
          this.dispatchEvent(
            new CustomEvent("error", {
              detail:
                "Direct connection failed. The peers may be behind restrictive NAT or firewall rules.",
            }),
          );
          this.dispatchEvent(new CustomEvent("reconnect"));
        }
      }
      if (pc.connectionState === "disconnected") {
        window.setTimeout(() => {
          if (pc.connectionState !== "disconnected") return;
          pc.close();
          this.links.delete(id);
          this.dispatchEvent(new CustomEvent("peers", { detail: this.peerCount }));
          this.dispatchEvent(new CustomEvent("reconnect"));
        }, 10_000);
      }
    };
    pc.ondatachannel = (event) => this.attachChannel(link, event.channel);
    return link;
  }

  private attachChannel(link: Link, channel: RTCDataChannel) {
    link.channel = channel;
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = LOW_WATER;
    channel.onopen = () => {
      this.links.set(link.id, link);
      void this.sendEnvelopeOnLink(link, {
        id: crypto.randomUUID(),
        origin: this.peerId,
        body: { type: "hello", peerId: this.peerId },
        direct: true,
      });
      this.dispatchEvent(new CustomEvent("peers", { detail: this.peerCount }));
    };
    channel.onmessage = (event) => {
      if (typeof event.data === "string") void this.receiveFragment(link, event.data);
      else void this.receiveBinary(link, event.data as ArrayBuffer | Blob);
    };
    channel.onerror = () =>
      this.dispatchEvent(new CustomEvent("error", { detail: "A peer connection encountered an error." }));
  }

  async createInvite(locked: boolean, salt?: string, access: "edit" | "read" = "edit"): Promise<string> {
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
      access,
      salt,
      description: link.pc.localDescription!,
    });
  }

  async createPeerOffer(target: string) {
    if (target === this.peerId || this.hasPeer(target)) return;
    if (this.routeCount >= MAX_DIRECT_PEERS) {
      throw new Error("This browser has reached its direct peer-route limit.");
    }
    const offerId = crypto.randomUUID();
    const link = this.createConnection(offerId);
    link.remotePeerId = target;
    const channel = link.pc.createDataChannel("p2p-share", { ordered: true });
    this.attachChannel(link, channel);
    await link.pc.setLocalDescription(await link.pc.createOffer());
    await waitForIceGathering(link.pc);
    this.offers.set(offerId, link);
    await this.send({
      type: "peer-offer",
      target,
      offerId,
      inviter: this.peerId,
      description: link.pc.localDescription,
    });
  }

  async createSignalingOffer(target: string) {
    if (target === this.peerId || this.hasPeer(target)) return;
    if (this.routeCount >= MAX_DIRECT_PEERS) return;
    const offerId = crypto.randomUUID();
    const link = this.createConnection(offerId);
    link.remotePeerId = target;
    const channel = link.pc.createDataChannel("p2p-share", { ordered: true });
    this.attachChannel(link, channel);
    await link.pc.setLocalDescription(await link.pc.createOffer());
    await waitForIceGathering(link.pc);
    this.offers.set(offerId, link);
    const description = link.pc.localDescription!;
    return {
      offerId,
      description: { type: description.type, sdp: description.sdp } satisfies RTCSessionDescriptionInit,
    };
  }

  async acceptSignalingOffer(
    offerId: string,
    inviter: string,
    description: RTCSessionDescriptionInit,
  ) {
    if (this.hasPeer(inviter)) return;
    if (this.routeCount >= MAX_DIRECT_PEERS) return;
    const link = this.createConnection(offerId);
    link.remotePeerId = inviter;
    await link.pc.setRemoteDescription(description);
    await link.pc.setLocalDescription(await link.pc.createAnswer());
    await waitForIceGathering(link.pc);
    this.links.set(link.id, link);
    const answer = link.pc.localDescription!;
    return {
      offerId,
      description: { type: answer.type, sdp: answer.sdp } satisfies RTCSessionDescriptionInit,
    };
  }

  async acceptSignalingAnswer(
    offerId: string,
    responder: string,
    description: RTCSessionDescriptionInit,
  ) {
    await this.acceptPeerAnswer(offerId, responder, description);
  }

  reportError(message: string) {
    console.error(`[p2p-share] ${message}`);
    this.dispatchEvent(new CustomEvent("error", { detail: message }));
  }

  async acceptPeerOffer(
    offerId: string,
    inviter: string,
    description: RTCSessionDescriptionInit,
  ) {
    if (this.hasPeer(inviter)) return;
    if (this.routeCount >= MAX_DIRECT_PEERS) return;
    const link = this.createConnection(offerId);
    link.remotePeerId = inviter;
    await link.pc.setRemoteDescription(description);
    await link.pc.setLocalDescription(await link.pc.createAnswer());
    await waitForIceGathering(link.pc);
    this.links.set(link.id, link);
    await this.send({
      type: "peer-answer",
      target: inviter,
      offerId,
      responder: this.peerId,
      description: link.pc.localDescription,
    });
  }

  async acceptPeerAnswer(
    offerId: string,
    responder: string,
    description: RTCSessionDescriptionInit,
  ) {
    const link = this.offers.get(offerId);
    if (!link || link.remotePeerId !== responder) return;
    await link.pc.setRemoteDescription(description);
    this.links.set(link.id, link);
    this.offers.delete(offerId);
  }

  async setLocalMedia(stream?: MediaStream) {
    this.localStream = stream;
    await Promise.all(
      [...this.links.values(), ...this.offers.values()].flatMap((link) =>
        link.pc.getTransceivers().map((transceiver) =>
          transceiver.sender.replaceTrack(
            transceiver.receiver.track.kind === "audio"
              ? stream?.getAudioTracks()[0] ?? null
              : stream?.getVideoTracks()[0] ?? null,
          ),
        ),
      ),
    );
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
      direct: false,
    };
    this.seen.add(envelope.id);
    this.pruneSeen();
    await this.broadcastEnvelope(envelope);
  }

  async sendTo(peerId: string, body: Record<string, unknown>): Promise<void> {
    const link = [...this.links.values()].find(
      (candidate) => candidate.remotePeerId === peerId && candidate.channel?.readyState === "open",
    );
    if (!link?.channel) throw new Error("The selected peer is no longer directly connected.");
    const envelope: NetworkEnvelope = {
      id: crypto.randomUUID(),
      origin: this.peerId,
      body,
      direct: true,
    };
    await this.sendEnvelopeOnLink(link, envelope);
  }

  async sendToConnected(body: Record<string, unknown>): Promise<void> {
    await Promise.all(this.connectedPeerIds.map((peerId) => this.sendTo(peerId, body)));
  }

  async waitForPeer(peerId: string, timeoutMs = 15_000): Promise<boolean> {
    if (this.isPeerConnected(peerId)) return true;
    return new Promise((resolve) => {
      const timeout = window.setTimeout(() => {
        off();
        resolve(false);
      }, timeoutMs);
      const off = this.on("peers", () => {
        if (!this.isPeerConnected(peerId)) return;
        window.clearTimeout(timeout);
        off();
        resolve(true);
      });
    });
  }

  private async sendEnvelopeOnLink(link: Link, envelope: NetworkEnvelope) {
    if (!link.channel || link.channel.readyState !== "open") {
      throw new Error("The selected peer is no longer directly connected.");
    }
    const bytes = encodeJson(envelope);
    const messageId = crypto.randomUUID();
    const count = Math.max(1, Math.ceil(bytes.length / MAX_FRAGMENT));
    for (let index = 0; index < count; index += 1) {
      const cipher = await encryptBytes(
        bytes.subarray(index * MAX_FRAGMENT, (index + 1) * MAX_FRAGMENT),
        this.key,
      );
      await this.sendFrame(
        link.channel,
        JSON.stringify({ m: messageId, i: index, n: count, ...cipher } satisfies Fragment),
      );
    }
  }

  async sendBinaryTo(
    peerId: string,
    body: Record<string, unknown>,
    payload: Uint8Array,
  ): Promise<void> {
    const link = [...this.links.values()].find(
      (candidate) => candidate.remotePeerId === peerId && candidate.channel?.readyState === "open",
    );
    if (!link?.channel) throw new Error("The selected peer is no longer directly connected.");
    const header = encodeJson({
      id: crypto.randomUUID(),
      origin: this.peerId,
      body,
      direct: true,
    } satisfies BinaryHeader);
    const packet = new Uint8Array(8 + header.length + payload.length);
    packet.set(BINARY_MAGIC, 0);
    new DataView(packet.buffer).setUint32(4, header.length);
    packet.set(header, 8);
    packet.set(payload, 8 + header.length);
    await this.sendBinaryFrame(link.channel, packet.buffer);
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
    await this.waitForCapacity(channel);
    channel.send(frame);
  }

  private async sendBinaryFrame(channel: RTCDataChannel, frame: ArrayBuffer) {
    await this.waitForCapacity(channel);
    channel.send(frame);
  }

  private async waitForCapacity(channel: RTCDataChannel) {
    if (channel.bufferedAmount > HIGH_WATER) {
      await new Promise<void>((resolve) => {
        const done = () => {
          channel.removeEventListener("bufferedamountlow", done);
          resolve();
        };
        channel.addEventListener("bufferedamountlow", done, { once: true });
      });
    }
  }

  private async receiveBinary(link: Link, raw: ArrayBuffer | Blob) {
    try {
      const buffer = raw instanceof Blob ? await raw.arrayBuffer() : raw;
      const packet = new Uint8Array(buffer);
      if (packet.length < 8 || !BINARY_MAGIC.every((value, index) => packet[index] === value)) {
        throw new Error("Received an unsupported binary peer packet.");
      }
      const headerLength = new DataView(buffer).getUint32(4);
      if (headerLength <= 0 || 8 + headerLength > packet.length) {
        throw new Error("Received a malformed binary peer packet.");
      }
      const envelope = decodeJson<BinaryHeader>(packet.subarray(8, 8 + headerLength));
      if (link.remotePeerId && envelope.origin !== link.remotePeerId) {
        throw new Error("Binary packet origin did not match its direct peer.");
      }
      envelope.body.data = packet.slice(8 + headerLength);
      this.dispatchEvent(new CustomEvent("message", { detail: envelope }));
    } catch (error) {
      this.dispatchEvent(new CustomEvent("error", {
        detail: error instanceof Error ? error.message : "Could not read an incoming binary peer packet.",
      }));
    }
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
      if (!envelope.direct) await this.broadcastEnvelope(envelope, link.id);
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

  restartConnections() {
    for (const link of this.links.values()) link.pc.close();
    for (const link of this.offers.values()) link.pc.close();
    this.links.clear();
    this.offers.clear();
    this.pending.clear();
    this.dispatchEvent(new CustomEvent("peers", { detail: 0 }));
  }
}

export async function inspectInvite(token: string): Promise<InviteToken> {
  const signal = await decodeSignal(token);
  if (signal.kind !== "invite") throw new Error("Expected an invite link.");
  return signal;
}
