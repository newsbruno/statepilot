import { describe, expect, it } from "vitest";
import type { BrowserState } from "@statepilot/browser-state";
import { DefaultPredictionValidator } from "./default-prediction-validator";

const state: BrowserState = {
  id: "state-1",
  url: "https://example.com",
  urlHash: "url",
  domHash: "dom",
  visibleTextHash: "text",
  interactiveElements: [],
  viewport: { width: 1280, height: 720 },
  createdAt: new Date("2026-05-20T00:00:00.000Z")
};

describe("DefaultPredictionValidator", () => {
  it("accepts a matching expected state", async () => {
    const validator = new DefaultPredictionValidator();
    const result = await validator.validate({
      previousState: state,
      action: { type: "click", selector: "button" },
      expectedNextState: {
        urlHash: "url",
        domHash: "dom",
        visibleTextHash: "text"
      },
      actualNextState: state
    });

    expect(result.ok).toBe(true);
    expect(result.mismatchReasons).toEqual([]);
  });
});
