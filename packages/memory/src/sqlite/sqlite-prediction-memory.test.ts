import { describe, expect, it } from "vitest";
import { SqlitePredictionMemory } from "./sqlite-prediction-memory";

describe("SqlitePredictionMemory", () => {
  it("persists and reads a transition", async () => {
    const memory = new SqlitePredictionMemory({ path: ":memory:" });

    await memory.saveTransition({
      siteKey: "demo",
      fromStateHash: "state-a",
      action: { type: "navigate", url: "https://example.com" },
      toStateHash: "state-b",
      latencyMs: 15
    });

    const best = await memory.findBestTransition({
      siteKey: "demo",
      fromStateHash: "state-a"
    });

    expect(best?.toStateHash).toBe("state-b");
    expect(best?.successRate).toBe(1);

    memory.close();
  });
});
