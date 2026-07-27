import JSZip from "jszip";
import { importProjectZip, isProbablyBinary, MANIFEST_FILE, sanitizeProjectPath } from "../src/lib/project";

describe("project import safety", () => {
  it("normalizes traversal and unsafe path characters", () => {
    expect(sanitizeProjectPath("../../src\\bad:name?.ts")).toBe("src/bad-name-.ts");
  });

  it("detects NUL-containing binary payloads", () => {
    expect(isProbablyBinary(new Uint8Array([65, 66, 0, 67]))).toBe(true);
    expect(isProbablyBinary(new TextEncoder().encode("const ready = true;\n"))).toBe(false);
  });

  it("imports UTF-8 files and skips binary ZIP entries", async () => {
    const zip = new JSZip();
    zip.file("src/index.js", "console.log('ready')");
    zip.file("asset.bin", new Uint8Array([0, 1, 2, 3]));
    zip.file(MANIFEST_FILE, JSON.stringify({
      version: 1,
      name: "demo",
      description: "",
      createdAt: 1,
      updatedAt: 1,
    }));
    const blob = await zip.generateAsync({ type: "uint8array" });
    const result = await importProjectZip(new File([blob], "demo.zip", { type: "application/zip" }));
    expect(result.files).toEqual([{
      name: "src/index.js",
      content: "console.log('ready')",
      language: "javascript",
    }]);
    expect(result.warnings[0]).toContain("asset.bin");
    expect(result.manifest?.name).toBe("demo");
  });
});
