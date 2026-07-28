import { describe, expect, it } from "vitest";
import { requiresDisplayName } from "../src/lib/identity";

describe("display-name onboarding", () => {
  it("prompts for missing and generated guest names", () => {
    expect(requiresDisplayName(null)).toBe(true);
    expect(requiresDisplayName("")).toBe(true);
    expect(requiresDisplayName("Guest A12B")).toBe(true);
    expect(requiresDisplayName("mobile-GUEST-user")).toBe(true);
  });

  it("keeps a previously chosen personal name", () => {
    expect(requiresDisplayName("Alex Morgan")).toBe(false);
  });
});
