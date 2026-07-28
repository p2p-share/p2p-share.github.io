import { describe, expect, it } from "vitest";
import { CLOUDFLARE_STUN_FALLBACK, normalizeIceServers } from "../src/lib/ice";

describe("WebRTC ICE configuration", () => {
  it("uses only Cloudflare STUN when short-lived credentials are unavailable", () => {
    expect(CLOUDFLARE_STUN_FALLBACK).toEqual([{
      urls: [
        "stun:stun.cloudflare.com:3478",
        "stun:stun.cloudflare.com:53",
      ],
    }]);
  });

  it("accepts authenticated Cloudflare TURN responses", () => {
    expect(normalizeIceServers([{
      urls: ["turn:turn.cloudflare.com:3478?transport=udp"],
      username: "short-lived-user",
      credential: "short-lived-credential",
    }])).toHaveLength(1);
  });

  it("rejects TURN routes without short-lived credentials", () => {
    expect(normalizeIceServers([{
      urls: ["turn:turn.cloudflare.com:3478?transport=udp"],
    }])).toEqual([]);
  });
});
