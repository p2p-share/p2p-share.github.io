import { CrossTabCoordinator } from "../src/lib/crossTab";

class FakeBroadcastChannel {
  static channels = new Map<string, Set<FakeBroadcastChannel>>();
  onmessage?: (event: MessageEvent) => void;
  constructor(readonly name: string) {
    const channels = FakeBroadcastChannel.channels.get(name) || new Set();
    channels.add(this);
    FakeBroadcastChannel.channels.set(name, channels);
  }
  postMessage(data: unknown) {
    for (const channel of FakeBroadcastChannel.channels.get(this.name) || []) {
      if (channel !== this) channel.onmessage?.({ data } as MessageEvent);
    }
  }
  close() {
    FakeBroadcastChannel.channels.get(this.name)?.delete(this);
  }
}

describe("cross-tab project coordination", () => {
  beforeEach(() => {
    FakeBroadcastChannel.channels.clear();
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("detects duplicate tabs and synchronizes Yjs update bytes", async () => {
    const first = new CrossTabCoordinator("room-a");
    const second = new CrossTabCoordinator("room-a");
    const received = new Promise<Uint8Array>((resolve) => second.on("update", (event) => resolve(event.detail)));
    first.sendUpdate(new Uint8Array([1, 2, 3]));
    await expect(received).resolves.toEqual(new Uint8Array([1, 2, 3]));
    expect(first.otherTabCount).toBe(1);
    expect(second.otherTabCount).toBe(1);
    expect(Number(first.isLeader) + Number(second.isLeader)).toBe(1);
    first.close();
    second.close();
  });

  it("hands a snippet to another tab", async () => {
    const first = new CrossTabCoordinator("room-b");
    const second = new CrossTabCoordinator("room-b");
    const received = new Promise((resolve) => second.on("snippet", (event) => resolve(event.detail)));
    first.sendSnippet("demo.ts", "typescript", "const demo = true");
    await expect(received).resolves.toEqual({
      name: "demo.ts",
      language: "typescript",
      content: "const demo = true",
    });
    first.close();
    second.close();
  });
});
