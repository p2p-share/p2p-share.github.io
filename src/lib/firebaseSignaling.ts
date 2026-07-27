import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { ensureSignalingIdentity, firestore } from "./firebase";
import type { PeerMesh } from "./mesh";

type Signal = {
  senderPeerId: string;
  targetPeerId: string;
  type: "offer" | "answer";
  payload: {
    offerId: string;
    description: RTCSessionDescriptionInit;
  };
};

const SIGNAL_TTL_MS = 30 * 60 * 1000;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

export type FirebaseRoomSecurity = {
  locked: boolean;
  salt?: string;
  verificationPayload?: string;
  verificationIv?: string;
};

export async function getFirebaseRoomSecurity(roomId: string): Promise<FirebaseRoomSecurity | undefined> {
  await ensureSignalingIdentity();
  const snapshot = await getDoc(doc(firestore, "rooms", roomId));
  if (!snapshot.exists()) return;
  const data = snapshot.data();
  return {
    locked: data.locked === true,
    salt: typeof data.salt === "string" ? data.salt : undefined,
    verificationPayload: typeof data.verificationPayload === "string" ? data.verificationPayload : undefined,
    verificationIv: typeof data.verificationIv === "string" ? data.verificationIv : undefined,
  };
}

export class FirebaseSignaling {
  private unsubscribers: Unsubscribe[] = [];
  private heartbeat?: number;
  private closed = false;

  constructor(
    private readonly roomId: string,
    private readonly mesh: PeerMesh,
    private readonly name: () => string,
    private readonly initialSecurity: FirebaseRoomSecurity,
  ) {}

  async connect() {
    const user = await ensureSignalingIdentity();
    if (this.closed) return;
    const roomRef = doc(firestore, "rooms", this.roomId);
    const existing = await getDoc(roomRef);
    if (!existing.exists()) {
      try {
        await setDoc(roomRef, {
          hostUid: user.uid,
          status: "active",
          locked: this.initialSecurity.locked,
          ...(this.initialSecurity.salt ? { salt: this.initialSecurity.salt } : {}),
          ...(this.initialSecurity.verificationPayload
            ? {
                verificationPayload: this.initialSecurity.verificationPayload,
                verificationIv: this.initialSecurity.verificationIv || null,
              }
            : {}),
          createdAt: serverTimestamp(),
          expiresAt: Timestamp.fromMillis(Date.now() + ROOM_TTL_MS),
        });
      } catch (error) {
        // Two peers can open a brand-new room at the same instant. Firestore
        // permits only the winning creator to become host; the other joins it.
        const racedRoom = await getDoc(roomRef);
        if (!racedRoom.exists()) throw error;
      }
    }

    const participantRef = doc(roomRef, "participants", this.mesh.peerId);
    const announce = () => setDoc(participantRef, {
      uid: user.uid,
      name: this.name(),
      joinedAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
    }, { merge: true });
    await announce();

    this.unsubscribers.push(onSnapshot(collection(roomRef, "participants"), (snapshot) => {
      for (const change of snapshot.docChanges()) {
        const peerId = change.doc.id;
        if (change.type === "removed" || peerId === this.mesh.peerId) continue;
        if (this.mesh.peerId < peerId && !this.mesh.hasPeer(peerId)) {
          void this.createOffer(peerId);
        }
      }
    }, (error) => this.mesh.reportError(`Automatic peer discovery failed: ${error.message}`)));

    const inbox = query(
      collection(roomRef, "signals"),
      where("targetPeerId", "==", this.mesh.peerId),
    );
    this.unsubscribers.push(onSnapshot(inbox, (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type !== "added") continue;
        void this.consumeSignal(change.doc.ref, change.doc.data() as Signal);
      }
    }, (error) => this.mesh.reportError(`Automatic signaling failed: ${error.message}`)));

    this.heartbeat = window.setInterval(() => void announce(), 30_000);
    window.addEventListener("pagehide", this.handlePageHide);
  }

  private async createOffer(targetPeerId: string) {
    try {
      const offer = await this.mesh.createSignalingOffer(targetPeerId);
      if (!offer) return;
      await this.publish({
        type: "offer",
        senderPeerId: this.mesh.peerId,
        targetPeerId,
        payload: offer,
      });
    } catch (error) {
      this.mesh.reportError(error instanceof Error ? error.message : "Could not create an automatic peer offer.");
    }
  }

  private async consumeSignal(reference: ReturnType<typeof doc>, signal: Signal) {
    try {
      if (signal.type === "offer") {
        const answer = await this.mesh.acceptSignalingOffer(
          signal.payload.offerId,
          signal.senderPeerId,
          signal.payload.description,
        );
        if (answer) {
          await this.publish({
            type: "answer",
            senderPeerId: this.mesh.peerId,
            targetPeerId: signal.senderPeerId,
            payload: answer,
          });
        }
      } else {
        await this.mesh.acceptSignalingAnswer(
          signal.payload.offerId,
          signal.senderPeerId,
          signal.payload.description,
        );
      }
      await deleteDoc(reference);
    } catch (error) {
      this.mesh.reportError(error instanceof Error ? error.message : "Could not process an automatic peer signal.");
    }
  }

  private publish(signal: Signal) {
    return addDoc(collection(firestore, "rooms", this.roomId, "signals"), {
      ...signal,
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + SIGNAL_TTL_MS),
    });
  }

  private handlePageHide = () => {
    void this.removeParticipant();
  };

  private removeParticipant() {
    return deleteDoc(doc(firestore, "rooms", this.roomId, "participants", this.mesh.peerId));
  }

  async setRoomSecurity(
    locked: boolean,
    salt?: string,
    verification?: { payload: string; iv?: string },
  ) {
    await ensureSignalingIdentity();
    await updateDoc(doc(firestore, "rooms", this.roomId), {
      locked,
      salt: salt || null,
      verificationPayload: verification?.payload || null,
      verificationIv: verification?.iv || null,
      expiresAt: Timestamp.fromMillis(Date.now() + ROOM_TTL_MS),
    });
  }

  disconnect() {
    this.closed = true;
    this.unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
    if (this.heartbeat) window.clearInterval(this.heartbeat);
    window.removeEventListener("pagehide", this.handlePageHide);
    void this.removeParticipant();
  }
}
