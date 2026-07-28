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

export const TURN_RELAY_CONFIGURED = turnServers.length > 0;
