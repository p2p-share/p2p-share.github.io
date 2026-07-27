import { decodeToken, encodeToken } from "../src/lib/encoding";

describe("invite token codec", () => {
  it("round trips structured signaling data", async () => {
    const value = {
      v: 1,
      kind: "invite",
      roomId: "room-123",
      description: { type: "offer", sdp: "v=0\r\n" },
    };
    const encoded = await encodeToken(value);
    expect(encoded).toMatch(/^[zj]\./);
    await expect(decodeToken(encoded)).resolves.toEqual(value);
  });

  it("rejects unknown token formats", async () => {
    await expect(decodeToken("x.aGVsbG8")).rejects.toThrow("Unsupported invite format");
  });
});
