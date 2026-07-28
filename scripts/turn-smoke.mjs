import { chromium } from "playwright-core";

const credentialsUrl = globalThis.process.env.TURN_CREDENTIALS_URL
  || "https://p2p-share-turn-credentials.shravanjerry.workers.dev";

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

try {
  const page = await browser.newPage();
  await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(async (endpoint) => {
    const response = await globalThis.fetch(endpoint, { cache: "no-store" });
    if (!response.ok) throw new Error(`Credential request returned ${response.status}.`);
    const payload = await response.json();
    if (!Array.isArray(payload.iceServers)) throw new Error("Credential response has no ICE servers.");

    const turnServer = payload.iceServers.find((server) =>
      (Array.isArray(server.urls) ? server.urls : [server.urls])
        .some((url) => /^turns?:/.test(url)),
    );
    if (!turnServer) throw new Error("Credential response has no TURN server.");
    const turnUrls = (Array.isArray(turnServer.urls) ? turnServer.urls : [turnServer.urls])
      .filter((url) => !/:53(?:\?|$)/.test(url));
    const requiredRoutes = {
      udp3478: turnUrls.find((url) => /:3478\?transport=udp$/.test(url)),
      tcp80: turnUrls.find((url) => /:80\?transport=tcp$/.test(url)),
      tls443: turnUrls.find((url) => /^turns:.*:443\?transport=tcp$/.test(url)),
    };
    if (Object.values(requiredRoutes).some((url) => !url)) {
      throw new Error(`Cloudflare response is missing a required corporate fallback: ${JSON.stringify(requiredRoutes)}`);
    }

    async function gatherRelay(url) {
      const startedAt = globalThis.performance.now();
      const connection = new globalThis.RTCPeerConnection({
        iceServers: [{ ...turnServer, urls: [url] }],
        iceTransportPolicy: "relay",
      });
      connection.createDataChannel("turn-candidate-smoke");
      const iceErrors = [];
      connection.addEventListener("icecandidateerror", (event) => {
        iceErrors.push(`${event.url || "ICE server"}: ${event.errorCode} ${event.errorText}`);
      });
      const candidate = new Promise((resolve) => {
        connection.addEventListener("icecandidate", (event) => {
          if (event.candidate?.type === "relay") resolve(event.candidate.candidate);
        });
      });
      await connection.setLocalDescription(await connection.createOffer());
      const relayCandidate = await Promise.race([
        candidate,
        new Promise((_, reject) => {
          globalThis.setTimeout(() => reject(new Error(
            `No relay candidate for ${url}. ICE errors: ${iceErrors.join(" | ") || "none"}.`,
          )), 20_000);
        }),
      ]);
      connection.close();
      return {
        candidate: relayCandidate,
        elapsedMs: Math.round(globalThis.performance.now() - startedAt),
      };
    }

    const routeResults = {};
    for (const [name, url] of Object.entries(requiredRoutes)) {
      const route = await gatherRelay(url);
      routeResults[name] = { status: "relay", elapsedMs: route.elapsedMs };
    }

    const tlsServer = [{ ...turnServer, urls: [requiredRoutes.tls443] }];
    const left = new globalThis.RTCPeerConnection({ iceServers: tlsServer, iceTransportPolicy: "relay" });
    const right = new globalThis.RTCPeerConnection({ iceServers: tlsServer, iceTransportPolicy: "relay" });
    const sender = left.createDataChannel("turn-end-to-end");
    const received = new Promise((resolve) => {
      right.addEventListener("datachannel", (event) => {
        event.channel.addEventListener("message", (message) => resolve(message.data));
      });
    });
    const connected = new Promise((resolve, reject) => {
      const timeout = globalThis.setTimeout(
        () => reject(new Error("TLS 443 relay candidates did not establish a peer route.")),
        25_000,
      );
      sender.addEventListener("open", () => {
        globalThis.clearTimeout(timeout);
        resolve();
      });
    });
    const waitForGathering = (connection) => connection.iceGatheringState === "complete"
      ? Promise.resolve()
      : new Promise((resolve) => connection.addEventListener("icegatheringstatechange", () => {
        if (connection.iceGatheringState === "complete") resolve();
      }));
    const peerRouteStartedAt = globalThis.performance.now();
    await left.setLocalDescription(await left.createOffer());
    await waitForGathering(left);
    await right.setRemoteDescription(left.localDescription);
    await right.setLocalDescription(await right.createAnswer());
    await waitForGathering(right);
    await left.setRemoteDescription(right.localDescription);
    await connected;
    sender.send("cloudflare-turn-ok");
    const message = await received;
    left.close();
    right.close();
    if (message !== "cloudflare-turn-ok") throw new Error("TLS 443 relay data was not delivered accurately.");

    return {
      credentialStatus: response.status,
      iceServerCount: payload.iceServers.length,
      routes: routeResults,
      tls443PeerRoute: "connected",
      tls443PeerRouteMs: Math.round(globalThis.performance.now() - peerRouteStartedAt),
      dataIntegrity: "verified",
    };
  }, credentialsUrl);
  globalThis.console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
