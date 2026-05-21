import type { AgentAction } from "@statepilot/action-model";
import type { BrowserState, ExpectedState } from "@statepilot/browser-state";
import type { EnergyScore } from "./energy/energy-score";

export interface ValidationInput {
  readonly previousState: BrowserState;
  readonly action: AgentAction;
  readonly expectedNextState?: ExpectedState;
  readonly actualNextState: BrowserState;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly confidence: number;
  readonly energy: EnergyScore;
  readonly mismatchReasons: readonly string[];
}

export interface PredictionValidator {
  validate(input: ValidationInput): Promise<ValidationResult>;
}
