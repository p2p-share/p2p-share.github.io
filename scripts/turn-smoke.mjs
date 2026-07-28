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

    const connection = new globalThis.RTCPeerConnection({
      iceServers: payload.iceServers,
      iceTransportPolicy: "relay",
    });
    connection.createDataChannel("turn-smoke");
    const relayCandidates = [];
    const candidateTypes = [];
    const iceErrors = [];
    let resolveRelay;
    const relayReady = new Promise((resolve) => { resolveRelay = resolve; });
    connection.addEventListener("icecandidate", (event) => {
      if (event.candidate?.type) candidateTypes.push(event.candidate.type);
      if (event.candidate?.type === "relay") {
        relayCandidates.push(event.candidate.candidate);
        resolveRelay();
      }
    });
    connection.addEventListener("icecandidateerror", (event) => {
      iceErrors.push(`${event.url || "ICE server"}: ${event.errorCode} ${event.errorText}`);
    });
    await connection.setLocalDescription(await connection.createOffer());
    await Promise.race([
      relayReady,
      new Promise((_, reject) => {
        globalThis.setTimeout(() => reject(new Error(
          `Timed out waiting for a Cloudflare TURN relay candidate. Candidate types: ${candidateTypes.join(", ") || "none"}. ICE errors: ${iceErrors.join(" | ") || "none"}.`,
        )), 30_000);
      }),
    ]);
    connection.close();
    if (!relayCandidates.length) throw new Error("Cloudflare returned credentials, but Chrome gathered no relay candidate.");
    return {
      credentialStatus: response.status,
      iceServerCount: payload.iceServers.length,
      relayCandidateCount: relayCandidates.length,
    };
  }, credentialsUrl);
  globalThis.console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
