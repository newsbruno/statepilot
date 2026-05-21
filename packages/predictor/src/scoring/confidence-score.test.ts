import { describe, expect, it } from "vitest";
import { clampConfidence, confidenceFromSuccessRate } from "./confidence-score";

describe("confidence scoring", () => {
  it("clamps confidence into the valid range", () => {
    expect(clampConfidence(2)).toBe(1);
    expect(clampConfidence(-1)).toBe(0);
  });

  it("increases confidence with repeated successes", () => {
    expect(confidenceFromSuccessRate(0.9, 10)).toBeGreaterThan(confidenceFromSuccessRate(0.9, 1));
  });
});
