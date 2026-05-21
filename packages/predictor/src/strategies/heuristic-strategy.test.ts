import { describe, expect, it } from "vitest";
import { HeuristicStrategy } from "./heuristic-strategy";
import type { PredictionInput } from "../types/prediction-input";

const baseInput: PredictionInput = {
  task: {
    id: "task-1",
    goal: "Login and search",
    input: {
      url: "https://example.com/login",
      email: "person@example.com",
      password: "secret"
    }
  },
  currentState: {
    id: "state-1",
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

describe("HeuristicStrategy", () => {
  it("predicts navigation when task input includes a URL", async () => {
    const prediction = await new HeuristicStrategy().predict(baseInput);

    expect(prediction?.action).toEqual({
      type: "navigate",
      url: "https://example.com/login"
    });
  });

  it("predicts filling a matching input element", async () => {
    const prediction = await new HeuristicStrategy().predict({
      ...baseInput,
      currentState: {
        ...baseInput.currentState,
        url: "https://example.com/login",
        interactiveElements: [
          {
            id: "input-email",
            role: "input",
            selector: "#email",
            placeholder: "Email",
            visible: true,
            enabled: true,
            stableHash: "email"
          }
        ]
      },
      previousActions: [{ type: "navigate", url: "https://example.com/login" }]
    });

    expect(prediction?.action).toMatchObject({
      type: "fill",
      selector: "#email",
      value: "person@example.com"
    });
  });

  it("extracts page text before clicking generic links when the goal asks for text", async () => {
    const prediction = await new HeuristicStrategy().predict({
      ...baseInput,
      task: {
        ...baseInput.task,
        goal: "Open https://techcrunch.com/ and extract page text",
        input: { url: "https://techcrunch.com/" }
      },
      currentState: {
        ...baseInput.currentState,
        url: "https://techcrunch.com/",
        interactiveElements: [
          {
            id: "headline-link",
            role: "link",
            selector: "a[href='/story']",
            text: "Startup story",
            visible: true,
            enabled: true,
            stableHash: "headline-link"
          }
        ]
      },
      previousActions: [{ type: "navigate", url: "https://techcrunch.com/" }]
    });

    expect(prediction?.action).toMatchObject({
      type: "extract"
    });
  });
});
