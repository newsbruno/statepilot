import { describe, expect, it } from "vitest";
import { calculateEnergyScore } from "./energy-score";
import type { BrowserState } from "@statepilot/browser-state";

const baseState: BrowserState = {
  id: "state-1",
  url: "https://example.com/login",
  urlHash: "url-a",
  domHash: "dom-a",
  visibleTextHash: "text-a",
  interactiveElements: [],
  viewport: { width: 1280, height: 720 },
  createdAt: new Date("2026-05-20T00:00:00.000Z")
};

describe("calculateEnergyScore", () => {
  it("returns low energy when expected hashes match actual state", () => {
    const energy = calculateEnergyScore({
      previousState: baseState,
      action: { type: "click", selector: "button" },
      expected: {
        urlHash: "url-a",
        domHash: "dom-a",
        visibleTextHash: "text-a"
      },
      actual: baseState
    });

    expect(energy.total).toBe(0);
  });

  it("returns high energy when all expected hashes diverge", () => {
    const energy = calculateEnergyScore({
      previousState: baseState,
      action: { type: "click", selector: "button" },
      expected: {
        urlHash: "url-b",
        domHash: "dom-b",
        visibleTextHash: "text-b"
      },
      actual: baseState
    });

    expect(energy.total).toBeGreaterThan(0.7);
  });
});
