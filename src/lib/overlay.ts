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

export function shouldAcceptIncomingOffer(
  localPeerId: string,
  remotePeerId: string,
  connected: boolean,
  hasCompetingAttempt: boolean,
) {
  if (connected) return false;
  return !hasCompetingAttempt || localPeerId > remotePeerId;
}

export function selectOverlayNeighbors(
  ownPeerId: string,
  candidates: Iterable<readonly [string, number]>,
  maximum = OVERLAY_NEIGHBORS,
) {
  const ownRing = ringPosition(ownPeerId);
  const available = [...new Map(candidates)]
    .filter(([peerId]) => peerId !== ownPeerId);
  const clockwise = [...available].sort(([leftId, left], [rightId, right]) => (
    ((left - ownRing + RING_SIZE) % RING_SIZE)
    - ((right - ownRing + RING_SIZE) % RING_SIZE)
    || leftId.localeCompare(rightId)
  ));
  const counterClockwise = [...available].sort(([leftId, left], [rightId, right]) => (
    ((ownRing - left + RING_SIZE) % RING_SIZE)
    - ((ownRing - right + RING_SIZE) % RING_SIZE)
    || leftId.localeCompare(rightId)
  ));
  const selected = new Set([
    ...clockwise.slice(0, Math.ceil(maximum / 2)).map(([peerId]) => peerId),
    ...counterClockwise.slice(0, Math.floor(maximum / 2)).map(([peerId]) => peerId),
  ]);
  if (selected.size < Math.min(maximum, available.length)) {
    const nearest = [...available].sort(([leftId, left], [rightId, right]) => {
      const leftDistance = Math.min(
        (left - ownRing + RING_SIZE) % RING_SIZE,
        (ownRing - left + RING_SIZE) % RING_SIZE,
      );
      const rightDistance = Math.min(
        (right - ownRing + RING_SIZE) % RING_SIZE,
        (ownRing - right + RING_SIZE) % RING_SIZE,
      );
      return leftDistance - rightDistance || leftId.localeCompare(rightId);
    });
    for (const [peerId] of nearest) {
      selected.add(peerId);
      if (selected.size >= Math.min(maximum, available.length)) break;
    }
  }
  return [...selected];
}
