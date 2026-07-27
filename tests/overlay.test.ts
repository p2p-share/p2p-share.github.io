import { describe, expect, it } from "vitest";
import {
  DISCOVERY_WINDOW,
  OVERLAY_NEIGHBORS,
  ringPosition,
  selectOverlayNeighbors,
} from "../src/lib/overlay";

describe("large-room peer overlay", () => {
  it("bounds every browser to eight selected neighbors in a 10,000-peer room", () => {
    const peers = Array.from({ length: 10_000 }, (_, index) => {
      const peerId = `peer-${index.toString().padStart(5, "0")}`;
      return [peerId, ringPosition(peerId)] as const;
    }).sort((left, right) => left[1] - right[1]);

    for (let index = 0; index < peers.length; index += 1) {
      const candidates: Array<readonly [string, number]> = [];
      for (let offset = -DISCOVERY_WINDOW; offset <= DISCOVERY_WINDOW; offset += 1) {
        candidates.push(peers[(index + offset + peers.length) % peers.length]);
      }
      const selected = selectOverlayNeighbors(peers[index][0], candidates);
      expect(selected).toHaveLength(OVERLAY_NEIGHBORS);
      expect(new Set(selected).size).toBe(selected.length);
      expect(selected).not.toContain(peers[index][0]);
    }
  });

  it("selects the same neighbors regardless of query result order", () => {
    const own = "peer-owner";
    const candidates = Array.from({ length: 20 }, (_, index) => {
      const peerId = `candidate-${index}`;
      return [peerId, ringPosition(peerId)] as const;
    });
    expect(selectOverlayNeighbors(own, candidates))
      .toEqual(selectOverlayNeighbors(own, [...candidates].reverse()));
  });
});
