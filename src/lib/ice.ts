export const CLOUDFLARE_STUN_FALLBACK: RTCIceServer[] = [{
  urls: [
    "stun:stun.cloudflare.com:3478",
    "stun:stun.cloudflare.com:53",
  ],
}];

type IceServerResponse = {
  iceServers?: unknown;
};

export function normalizeIceServers(value: unknown): RTCIceServer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): RTCIceServer[] => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Record<string, unknown>;
    const urls = (Array.isArray(candidate.urls) ? candidate.urls : [candidate.urls])
      .filter((url): url is string =>
        typeof url === "string" && /^(stun|turn|turns):/i.test(url),
      );
    if (!urls.length) return [];
    const hasTurn = urls.some((url) => /^turns?:/i.test(url));
    if (
      hasTurn
      && (typeof candidate.username !== "string" || typeof candidate.credential !== "string")
    ) return [];
    return [{
      urls,
      ...(hasTurn
        ? { username: candidate.username as string, credential: candidate.credential as string }
        : {}),
    }];
  });
}

let iceServerRequest: Promise<RTCIceServer[]> | undefined;

export function loadIceServers() {
  if (iceServerRequest) return iceServerRequest;
  const endpoint = import.meta.env.VITE_TURN_CREDENTIALS_URL;
  if (!endpoint) return Promise.resolve(CLOUDFLARE_STUN_FALLBACK);
  iceServerRequest = (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6_000);
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        mode: "cors",
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`TURN credential service returned ${response.status}.`);
      const remote = normalizeIceServers(
        ((await response.json()) as IceServerResponse).iceServers,
      );
      if (!remote.some((server) =>
        (Array.isArray(server.urls) ? server.urls : [server.urls])
          .some((url) => /^turns?:/i.test(url)),
      )) {
        throw new Error("TURN credential service returned no relay routes.");
      }
      return remote;
    } catch (error) {
      console.warn("[p2p-share] TURN credentials unavailable; using direct STUN routes.", error);
      return CLOUDFLARE_STUN_FALLBACK;
    } finally {
      window.clearTimeout(timeout);
    }
  })();
  return iceServerRequest;
}
