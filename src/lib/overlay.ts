export const OVERLAY_NEIGHBORS = 8;
export const DISCOVERY_WINDOW = 5;

const RING_SIZE = 0x1_0000_0000;

export function ringPosition(peerId: string) {
  let hash = 2166136261;
  for (let index = 0; index < peerId.length; index += 1) {
    hash ^= peerId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectOverlayNeighbors(
  ownPeerId: string,
  candidates: Iterable<readonly [string, number]>,
  maximum = OVERLAY_NEIGHBORS,
) {
  const ownRing = ringPosition(ownPeerId);
  return [...new Map(candidates)]
    .filter(([peerId]) => peerId !== ownPeerId)
    .sort(([leftId, left], [rightId, right]) => {
      const leftDistance = Math.min(
        (left - ownRing + RING_SIZE) % RING_SIZE,
        (ownRing - left + RING_SIZE) % RING_SIZE,
      );
      const rightDistance = Math.min(
        (right - ownRing + RING_SIZE) % RING_SIZE,
        (ownRing - right + RING_SIZE) % RING_SIZE,
      );
      return leftDistance - rightDistance || leftId.localeCompare(rightId);
    })
    .slice(0, maximum)
    .map(([peerId]) => peerId);
}
