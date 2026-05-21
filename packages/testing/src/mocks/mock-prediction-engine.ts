import type { AgentAction } from "@statepilot/action-model";
import type { Prediction, PredictionEngine, PredictionInput } from "@statepilot/predictor";

export class MockPredictionEngine implements PredictionEngine {
  private readonly actions: AgentAction[];
  private index = 0;

  constructor(actions: readonly AgentAction[]) {
    this.actions = [...actions];
  }

  async predict(_input: PredictionInput): Promise<Prediction> {
    const action = this.actions[this.index] ?? { type: "noop", reason: "No mock action left" };
    this.index += 1;

    return {
      action,
      confidence: 1,
      source: "recorded_flow",
      reason: "Mocked prediction"
    };
  }
}

export function createMockPredictionEngine(actions: readonly AgentAction[]): PredictionEngine {
  return new MockPredictionEngine(actions);
}
