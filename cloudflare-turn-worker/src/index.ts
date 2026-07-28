const CLOUDFLARE_TURN_API = "https://rtc.live.cloudflare.com/v1/turn/keys";

type WorkerEnv = {
  ALLOWED_ORIGIN?: string;
  ALLOWED_ORIGINS?: string;
  TURN_CREDENTIAL_TTL?: string;
  TURN_KEY_ID?: string;
  TURN_API_TOKEN?: string;
};

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin),
  });
}

function validIceServers(value: unknown) {
  return Array.isArray(value)
    && value.length > 0
    && value.every((server) =>
      server
      && (typeof server.urls === "string" || Array.isArray(server.urls)),
    );
}

export async function handleRequest(
  request: Request,
  env: WorkerEnv,
  fetchImpl: typeof fetch = fetch,
) {
  const requestOrigin = request.headers.get("Origin") || "";
  const allowedOrigins = (env.ALLOWED_ORIGINS || env.ALLOWED_ORIGIN || "https://p2p-share.github.io")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (!allowedOrigins.includes(requestOrigin)) {
    return json({ error: "Origin is not allowed." }, 403, allowedOrigins[0]);
  }
  const allowedOrigin = requestOrigin;
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
  }
  if (request.method !== "GET") {
    return json({ error: "Method is not allowed." }, 405, allowedOrigin);
  }
  if (!env.TURN_KEY_ID || !env.TURN_API_TOKEN) {
    return json({ error: "TURN credential service is not configured." }, 503, allowedOrigin);
  }

  const configuredTtl = Number.parseInt(env.TURN_CREDENTIAL_TTL || "3600", 10);
  const ttl = Math.min(86_400, Math.max(300, Number.isFinite(configuredTtl) ? configuredTtl : 3_600));
  let upstream;
  try {
    upstream = await fetchImpl(
      `${CLOUDFLARE_TURN_API}/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.TURN_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl }),
      },
    );
  } catch {
    return json({ error: "TURN provider is temporarily unavailable." }, 502, allowedOrigin);
  }

  if (upstream.status !== 201) {
    return json({ error: "TURN provider rejected the credential request." }, 502, allowedOrigin);
  }
  const payload = await upstream.json().catch(() => undefined) as
    | { iceServers?: unknown }
    | undefined;
  if (!payload || !validIceServers(payload.iceServers)) {
    return json({ error: "TURN provider returned an invalid response." }, 502, allowedOrigin);
  }
  return json({ iceServers: payload.iceServers }, 200, allowedOrigin);
}

export default {
  fetch(request: Request, env: WorkerEnv) {
    return handleRequest(request, env);
  },
};
