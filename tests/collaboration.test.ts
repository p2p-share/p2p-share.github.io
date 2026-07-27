import * as Y from "yjs";
import type { ChatMessage, ReviewEntry, SharedFile } from "../src/types";

function synchronize(source: Y.Doc, targets: Y.Doc[]) {
  const update = Y.encodeStateAsUpdate(source);
  for (const target of targets) Y.applyUpdate(target, update);
}

describe("multi-peer collaboration", () => {
  it("merges concurrent code and group-chat updates across three peers", () => {
    const host = new Y.Doc();
    const peerA = new Y.Doc();
    const peerB = new Y.Doc();
    synchronize(host, [peerA, peerB]);

    peerA.getText("content").insert(0, "const left = true;\n");
    peerB.getText("content").insert(0, "const right = true;\n");
    peerA.getArray<ChatMessage>("chat").push([{
      id: "message-a",
      peerId: "peer-a",
      sender: "Alex",
      color: "#7c5cff",
      text: "Ready to review",
      sentAt: 1,
    }]);
    peerB.getArray<ChatMessage>("chat").push([{
      id: "message-b",
      peerId: "peer-b",
      sender: "Sam",
      color: "#12b981",
      text: "I am here",
      sentAt: 2,
    }]);

    synchronize(peerA, [host, peerB]);
    synchronize(peerB, [host, peerA]);
    synchronize(host, [peerA, peerB]);

    for (const doc of [host, peerA, peerB]) {
      expect(doc.getText("content").toString()).toContain("const left");
      expect(doc.getText("content").toString()).toContain("const right");
      expect(doc.getArray<ChatMessage>("chat").toArray().map((item) => item.text).sort()).toEqual([
        "I am here",
        "Ready to review",
      ]);
    }
  });

  it("synchronizes multiple collaborative files and threaded review entries", () => {
    const host = new Y.Doc();
    const peer = new Y.Doc();
    const files = host.getMap<Y.Text>("code-files");
    const app = new Y.Text("console.log('app')");
    const test = new Y.Text("expect(true)");
    files.set("app", app);
    files.set("test", test);
    host.getArray<ReviewEntry>("reviews").push([{
      id: "comment-1",
      threadId: "thread-1",
      kind: "feedback",
      author: "Alex",
      peerId: "peer-a",
      body: "@Sam please review",
      line: 1,
      createdAt: 1,
    }]);
    synchronize(host, [peer]);

    expect([...peer.getMap<Y.Text>("code-files").values()].map((value) => value.toString())).toEqual([
      "console.log('app')",
      "expect(true)",
    ]);
    expect(peer.getArray<ReviewEntry>("reviews").get(0)).toMatchObject({
      kind: "feedback",
      line: 1,
    });
  });

  it("synchronizes multi-provider file availability across peers", () => {
    const host = new Y.Doc();
    const peer = new Y.Doc();
    host.getMap<SharedFile>("files").set("asset", {
      id: "asset",
      name: "demo.zip",
      type: "application/zip",
      size: 1024,
      owner: "host",
      ownerName: "Alex",
      providers: ["host"],
      addedAt: 1,
    });
    synchronize(host, [peer]);
    const received = peer.getMap<SharedFile>("files").get("asset")!;
    peer.getMap<SharedFile>("files").set("asset", {
      ...received,
      providers: [...received.providers!, "peer-a"],
    });
    synchronize(peer, [host]);
    expect(host.getMap<SharedFile>("files").get("asset")?.providers).toEqual(["host", "peer-a"]);
  });
});
