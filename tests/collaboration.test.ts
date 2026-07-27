import * as Y from "yjs";
import type { ChatMessage } from "../src/types";

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
});
