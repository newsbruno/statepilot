import { describe, expect, it } from "vitest";
import { createStateHash, createTextHash, normalizeText, stableStringify } from "./state-hash";

describe("state hashing", () => {
  it("returns the same hash for equivalent object values", () => {
    expect(createStateHash({ b: 2, a: 1 })).toBe(createStateHash({ a: 1, b: 2 }));
  });

  it("normalizes visible text before hashing", () => {
    expect(createTextHash(" Login\n  now ")).toBe(createTextHash("login now"));
  });

  it("stable stringifies arrays and dates", () => {
    expect(stableStringify([new Date("2026-05-20T00:00:00.000Z")])).toContain("2026-05-20");
    expect(normalizeText("a\n\nb")).toBe("a b");
  });
});
