import { ACCENT_THEMES, APP_THEMES, EDITOR_THEMES, storedAccentChoice, storedChoice } from "../src/lib/appearance";

describe("appearance preferences", () => {
  it("uses light mode for first-time and invalid preferences", () => {
    expect(storedChoice(null, APP_THEMES, "light")).toBe("light");
    expect(storedChoice("system", APP_THEMES, "light")).toBe("light");
  });

  it("restores supported appearance choices", () => {
    expect(storedChoice("dark", APP_THEMES, "light")).toBe("dark");
    expect(storedChoice("emerald", ACCENT_THEMES, "blue")).toBe("emerald");
    expect(storedChoice("forest", EDITOR_THEMES, "light")).toBe("forest");
  });

  it("migrates retired and unsupported accent preferences", () => {
    expect(storedAccentChoice("legacy")).toBe("blue");
    expect(storedAccentChoice("rose")).toBe("coral");
  });
});
