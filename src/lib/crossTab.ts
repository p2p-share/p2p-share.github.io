import { base64ToBytes, bytesToBase64 } from "./encoding";

export type RecentProject = { roomId: string; name: string; modifiedAt: number };
type CrossTabMessage =
  | { type: "hello" | "heartbeat" | "bye"; tabId: string; sentAt: number }
  | { type: "y-update"; tabId: string; update: string; sentAt: number }
  | { type: "snippet"; tabId: string; name: string; language: string; content: string; sentAt: number }
  | { type: "recent"; tabId: string; project: RecentProject; sentAt: number }
  | { type: "app-update"; tabId: string; version: string; sentAt: number };

type Events = {
  tabs: CustomEvent<{ count: number; leader: boolean }>;
  update: CustomEvent<Uint8Array>;
  snippet: CustomEvent<{ name: string; language: string; content: string }>;
  recent: CustomEvent<RecentProject>;
  "app-update": CustomEvent<string>;
};

export class CrossTabCoordinator extends EventTarget {
  readonly tabId = crypto.randomUUID();
  private channel?: BroadcastChannel;
  private tabs = new Map<string, number>();
  private heartbeat?: number;
  private sweep?: number;

  constructor(readonly roomId: string) {
    super();
    if (!("BroadcastChannel" in globalThis)) return;
    this.channel = new BroadcastChannel(`p2p-share:room:${roomId}`);
    this.channel.onmessage = (event: MessageEvent<CrossTabMessage>) => this.receive(event.data);
    this.post({ type: "hello", tabId: this.tabId, sentAt: Date.now() });
    this.heartbeat = window.setInterval(() => {
      this.post({ type: "heartbeat", tabId: this.tabId, sentAt: Date.now() });
    }, 4_000);
    this.sweep = window.setInterval(() => {
      const cutoff = Date.now() - 12_000;
      for (const [id, seen] of this.tabs) if (seen < cutoff) this.tabs.delete(id);
      this.emitTabs();
    }, 5_000);
    window.addEventListener("pagehide", this.close, { once: true });
  }

  on<K extends keyof Events>(event: K, listener: (event: Events[K]) => void) {
    this.addEventListener(event, listener as EventListener);
    return () => this.removeEventListener(event, listener as EventListener);
  }

  get otherTabCount() {
    return this.tabs.size;
  }

  get isLeader() {
    return [this.tabId, ...this.tabs.keys()].sort()[0] === this.tabId;
  }

  sendUpdate(update: Uint8Array) {
    this.post({ type: "y-update", tabId: this.tabId, update: bytesToBase64(update), sentAt: Date.now() });
  }

  sendSnippet(name: string, language: string, content: string) {
    this.post({ type: "snippet", tabId: this.tabId, name, language, content, sentAt: Date.now() });
  }

  announceRecent(project: RecentProject) {
    this.post({ type: "recent", tabId: this.tabId, project, sentAt: Date.now() });
  }

  announceAppUpdate(version: string) {
    this.post({ type: "app-update", tabId: this.tabId, version, sentAt: Date.now() });
  }

  close = () => {
    this.post({ type: "bye", tabId: this.tabId, sentAt: Date.now() });
    if (this.heartbeat) window.clearInterval(this.heartbeat);
    if (this.sweep) window.clearInterval(this.sweep);
    this.channel?.close();
    window.removeEventListener("pagehide", this.close);
  };

  private receive(message: CrossTabMessage) {
    if (!message || message.tabId === this.tabId) return;
    if (message.type === "bye") this.tabs.delete(message.tabId);
    else this.tabs.set(message.tabId, Date.now());
    if (message.type === "hello") {
      this.post({ type: "heartbeat", tabId: this.tabId, sentAt: Date.now() });
    } else if (message.type === "y-update") {
      this.dispatchEvent(new CustomEvent("update", { detail: base64ToBytes(message.update) }));
    } else if (message.type === "snippet") {
      this.dispatchEvent(new CustomEvent("snippet", { detail: { name: message.name, language: message.language, content: message.content } }));
    } else if (message.type === "recent") {
      this.dispatchEvent(new CustomEvent("recent", { detail: message.project }));
    } else if (message.type === "app-update") {
      this.dispatchEvent(new CustomEvent("app-update", { detail: message.version }));
    }
    this.emitTabs();
  }

  private emitTabs() {
    this.dispatchEvent(new CustomEvent("tabs", { detail: { count: this.otherTabCount, leader: this.isLeader } }));
  }

  private post(message: CrossTabMessage) {
    this.channel?.postMessage(message);
  }
}

export function mergeRecentProject(project: RecentProject) {
  const key = "p2p-share:recent-projects";
  let current: RecentProject[] = [];
  try { current = JSON.parse(localStorage.getItem(key) || "[]") as RecentProject[]; } catch { /* reset malformed cache */ }
  const next = [project, ...current.filter((item) => item.roomId !== project.roomId)]
    .sort((a, b) => b.modifiedAt - a.modifiedAt)
    .slice(0, 20);
  localStorage.setItem(key, JSON.stringify(next));
  return next;
}
