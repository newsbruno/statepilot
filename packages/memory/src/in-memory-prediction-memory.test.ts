import { describe, expect, it } from "vitest";
import { InMemoryPredictionMemory } from "./in-memory-prediction-memory";

describe("InMemoryPredictionMemory", () => {
  it("finds the best transition for a state", async () => {
    const memory = new InMemoryPredictionMemory();
    const transition = await memory.saveTransition({
      siteKey: "demo",
      fromStateHash: "state-a",
      action: { type: "click", selector: "button" },
      toStateHash: "state-b",
      latencyMs: 20
    });

    await memory.markSuccess(transition.id, { latencyMs: 10 });

    const best = await memory.findBestTransition({
      siteKey: "demo",
      fromStateHash: "state-a",
      minimumSuccessRate: 0.5
    });

    expect(best?.action).toEqual({ type: "click", selector: "button" });
    expect(best?.successCount).toBe(2);
  });

  it("lowers success rate after failures", async () => {
    const memory = new InMemoryPredictionMemory();
    const transition = await memory.saveTransition({
      fromStateHash: "state-a",
      action: { type: "click", selector: "button" },
      toStateHash: "state-b"
    });

    await memory.markFailure(transition.id, {
      code: "validation_failed",
      message: "State diverged"
    });

    const best = await memory.findBestTransition({
      fromStateHash: "state-a",
      minimumSuccessRate: 0.75
    });

    expect(best).toBeNull();
  });
});
