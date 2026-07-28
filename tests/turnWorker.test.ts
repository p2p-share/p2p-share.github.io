import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "../cloudflare-turn-worker/src/index";

const origin = "https://p2p-share.github.io";
const env = {
  ALLOWED_ORIGIN: origin,
  TURN_CREDENTIAL_TTL: "3600",
  TURN_KEY_ID: "key-id",
  TURN_API_TOKEN: "server-secret",
};

describe("Cloudflare TURN credential Worker", () => {
  it("rejects calls from another origin without contacting Cloudflare", async () => {
    const upstream = vi.fn();
    const response = await handleRequest(
      new Request("https://worker.example/", { headers: { Origin: "https://attacker.example" } }),
      env,
      upstream,
    );
    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("returns only the short-lived ICE response", async () => {
    const iceServers = [{
      urls: ["stun:stun.cloudflare.com:3478", "turn:turn.cloudflare.com:3478?transport=udp"],
      username: "temporary-user",
      credential: "temporary-credential",
    }];
    const upstream = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toEqual({
        Authorization: "Bearer server-secret",
        "Content-Type": "application/json",
      });
      expect(init?.body).toBe(JSON.stringify({ ttl: 3600 }));
      return new Response(JSON.stringify({ iceServers }), { status: 201 });
    });
    const response = await handleRequest(
      new Request("https://worker.example/", { headers: { Origin: origin } }),
      env,
      upstream,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ iceServers });
  });

  it("does not expose provider errors or secrets", async () => {
    const response = await handleRequest(
      new Request("https://worker.example/", { headers: { Origin: origin } }),
      env,
      vi.fn(async () => new Response("sensitive upstream details", { status: 401 })),
    );
    expect(response.status).toBe(502);
    expect(await response.text()).toBe('{"error":"TURN provider rejected the credential request."}');
  });
});
