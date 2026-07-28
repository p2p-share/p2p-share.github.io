import { describe, expect, it } from "vitest";
import { parseTurnServers } from "../src/lib/ice";

describe("WebRTC ICE configuration", () => {
  it("accepts multiple TURN transports as one authenticated server", () => {
    expect(parseTurnServers(
      "turn:relay.example.test:3478?transport=udp, turns:relay.example.test:5349?transport=tcp",
      "room-user",
      "temporary-secret",
    )).toEqual([{
      urls: [
        "turn:relay.example.test:3478?transport=udp",
        "turns:relay.example.test:5349?transport=tcp",
      ],
      username: "room-user",
      credential: "temporary-secret",
    }]);
  });

  it("does not expose an incomplete or non-TURN configuration", () => {
    expect(parseTurnServers("turn:relay.example.test:3478", "", "secret")).toEqual([]);
    expect(parseTurnServers("https://example.test", "user", "secret")).toEqual([]);
  });
});
