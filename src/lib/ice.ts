export const CLOUDFLARE_STUN_FALLBACK: RTCIceServer[] = [{
  urls: ["stun:stun.cloudflare.com:3478"],
}];

type IceServerResponse = {
  iceServers?: unknown;
};

function iceUrlPriority(url: string) {
  if (/^turns:.*:443\?transport=tcp$/i.test(url)) return 0;
  if (/^turns:/i.test(url)) return 1;
  if (/^turn:.*:80\?transport=tcp$/i.test(url)) return 2;
  if (/\?transport=tcp$/i.test(url)) return 3;
  if (/^turn:/i.test(url)) return 4;
  return 5;
}

export function normalizeIceServers(value: unknown): RTCIceServer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): RTCIceServer[] => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Record<string, unknown>;
    const urls = (Array.isArray(candidate.urls) ? candidate.urls : [candidate.urls])
      .filter((url): url is string =>
        typeof url === "string"
        && /^(stun|turn|turns):/i.test(url)
        && !/^[a-z]+:[^?]*:53(?:\?|$)/i.test(url),
      )
      .sort((left, right) => iceUrlPriority(left) - iceUrlPriority(right));
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
let iceServerLoadedAt = 0;
const ICE_CREDENTIAL_REFRESH_MS = 40 * 60 * 1000;

export function loadIceServers(forceRefresh = false) {
  if (
    iceServerRequest
    && !forceRefresh
    && Date.now() - iceServerLoadedAt < ICE_CREDENTIAL_REFRESH_MS
  ) return iceServerRequest;
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
      iceServerLoadedAt = Date.now();
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
