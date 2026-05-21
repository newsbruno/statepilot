import type { StateEncoder } from "@statepilot/browser-state";
import type { PredictionMemory } from "@statepilot/memory";
import type { PredictionEngine } from "@statepilot/predictor";
import type { PredictionValidator } from "@statepilot/validator";
import type { BrowserAdapter, BrowserSessionConfig } from "../browser/browser-adapter";

export interface RuntimeConfig {
  readonly adapter: BrowserAdapter;
  readonly memory?: PredictionMemory;
  readonly predictor?: PredictionEngine;
  readonly stateEncoder?: StateEncoder;
  readonly validator?: PredictionValidator;
  readonly session?: BrowserSessionConfig;
  readonly maxActions?: number;
}
