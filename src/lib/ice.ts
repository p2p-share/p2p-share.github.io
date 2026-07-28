const DEFAULT_STUN_SERVERS: RTCIceServer[] = [{
  urls: [
    "stun:stun.relay.metered.ca:80",
    "stun:stun.l.google.com:19302",
    "stun:stun1.l.google.com:19302",
    "stun:stun2.l.google.com:19302",
    "stun:stun3.l.google.com:19302",
  ],
}];

export function parseTurnServers(
  urlsValue?: string,
  username?: string,
  credential?: string,
): RTCIceServer[] {
  const urls = (urlsValue || "")
    .split(",")
    .map((url) => url.trim())
    .filter((url) => /^turns?:/i.test(url));
  if (!urls.length || !username || !credential) return [];
  return [{ urls, username, credential }];
}

const turnServers = parseTurnServers(
  import.meta.env.VITE_TURN_URLS,
  import.meta.env.VITE_TURN_USERNAME,
  import.meta.env.VITE_TURN_CREDENTIAL,
);

export const WEBRTC_ICE_SERVERS: RTCIceServer[] = [
  ...DEFAULT_STUN_SERVERS,
  ...turnServers,
];

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
  if (!endpoint) return Promise.resolve(WEBRTC_ICE_SERVERS);
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
      return WEBRTC_ICE_SERVERS;
    } finally {
      window.clearTimeout(timeout);
    }
  })();
  return iceServerRequest;
}
