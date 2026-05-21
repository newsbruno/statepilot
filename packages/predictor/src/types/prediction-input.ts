import type { AgentAction } from "@statepilot/action-model";
import type { BrowserState } from "@statepilot/browser-state";
import type { PredictionMemory } from "@statepilot/memory";

export interface PredictionTask<TInput = unknown> {
  readonly id: string;
  readonly goal: string;
  readonly siteKey?: string;
  readonly input: TInput;
}

export interface KnownFlow {
  readonly id: string;
  readonly nextActionIndex: number;
}

export interface PredictionInput<TInput = unknown> {
  readonly task: PredictionTask<TInput>;
  readonly currentState: BrowserState;
  readonly flow?: KnownFlow;
  readonly memory?: PredictionMemory;
  readonly previousActions: readonly AgentAction[];
}
