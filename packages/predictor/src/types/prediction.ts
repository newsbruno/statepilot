import type { AgentAction } from "@statepilot/action-model";
import type { ExpectedState } from "@statepilot/browser-state";
import type { PredictionSource } from "./prediction-source";

export interface Prediction {
  readonly action: AgentAction;
  readonly expectedNextState?: ExpectedState;
  readonly confidence: number;
  readonly source: PredictionSource;
  readonly reason?: string;
  readonly transitionId?: string;
}
