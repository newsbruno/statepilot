import { describe, expect, it } from "vitest";
import { createTextHash } from "@statepilot/browser-state";
import { InMemoryPredictionMemory } from "@statepilot/memory";
import { HybridPredictionEngine } from "./hybrid-prediction-engine";
import type { PredictionInput } from "./types/prediction-input";

const input: PredictionInput = {
  task: {
    id: "task-1",
    goal: "Open page",
    siteKey: "demo",
    input: { url: "https://example.com" }
  },
  currentState: {
    id: "state-a",
    url: "about:blank",
    urlHash: "url",
    domHash: "dom",
    visibleTextHash: "text",
    interactiveElements: [],
    viewport: { width: 1280, height: 720 },
    createdAt: new Date("2026-05-20T00:00:00.000Z")
  },
  previousActions: []
};

describe("HybridPredictionEngine", () => {
  it("prefers transition memory over heuristics when memory matches", async () => {
    const memory = new InMemoryPredictionMemory();
    await memory.saveTransition({
      siteKey: "demo",
      goalHash: createTextHash("Open page"),
      fromStateHash: "state-loaded",
      action: { type: "click", selector: "#known" },
      toStateHash: "state-b"
    });

    const prediction = await new HybridPredictionEngine({ memory }).predict({
      ...input,
      currentState: {
        ...input.currentState,
        id: "state-loaded",
        url: "https://example.com"
      },
      previousActions: [{ type: "navigate", url: "https://example.com" }]
    });

    expect(prediction.source).toBe("transition_memory");
    expect(prediction.action).toEqual({ type: "click", selector: "#known" });
  });

  it("prefers extraction over stale click memory when the task asks for page text", async () => {
    const memory = new InMemoryPredictionMemory();
    const extractionInput: PredictionInput = {
      ...input,
      task: {
        ...input.task,
        goal: "Open https://techcrunch.com/ and extract page text",
        input: { url: "https://techcrunch.com/" }
      },
      currentState: {
        ...input.currentState,
        id: "techcrunch-loaded",
        url: "https://techcrunch.com/",
        interactiveElements: [
          {
            id: "skip",
            role: "link",
            selector: "#wp-skip-link",
            stableSelector: "#wp-skip-link",
            text: "Skip to content",
            bbox: { x: 0, y: -1000, width: 120, height: 20 },
            visible: false,
            enabled: true,
            stableHash: "skip"
          },
          {
            id: "story",
            role: "link",
            selector: "a[href='/story']",
            text: "Startup story",
            bbox: { x: 20, y: 120, width: 180, height: 24 },
            visible: true,
            enabled: true,
            stableHash: "story"
          }
        ]
      },
      previousActions: [{ type: "navigate", url: "https://techcrunch.com/" }]
    };

    await memory.saveTransition({
      siteKey: "demo",
      goalHash: createTextHash("Open https://techcrunch.com/ and extract page text"),
      fromStateHash: "techcrunch-loaded",
      action: { type: "click", selector: "#wp-skip-link" },
      toStateHash: "after-skip"
    });

    const prediction = await new HybridPredictionEngine({ memory }).predict(extractionInput);

    expect(prediction.action).toMatchObject({ type: "extract" });
  });
});
