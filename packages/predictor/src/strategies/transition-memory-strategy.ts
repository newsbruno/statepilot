import { createTextHash } from "@statepilot/browser-state";
import type { PredictionMemory } from "@statepilot/memory";
import type { PredictionStrategy } from "../prediction-engine";
import { confidenceFromSuccessRate } from "../scoring/confidence-score";
import type { Prediction } from "../types/prediction";
import type { PredictionInput } from "../types/prediction-input";

export interface TransitionMemoryStrategyOptions {
  readonly memory: PredictionMemory;
  readonly minimumSuccessRate?: number;
}

export class TransitionMemoryStrategy implements PredictionStrategy {
  readonly source = "transition_memory" as const;

  private readonly memory: PredictionMemory;
  private readonly minimumSuccessRate: number;

  constructor(options: TransitionMemoryStrategyOptions) {
    this.memory = options.memory;
    this.minimumSuccessRate = options.minimumSuccessRate ?? 0.55;
  }

  async predict(input: PredictionInput): Promise<Prediction | null> {
    const transition = await this.memory.findBestTransition({
      siteKey: input.task.siteKey,
      goalHash: createTextHash(input.task.goal),
      fromStateHash: input.currentState.id,
      minimumSuccessRate: this.minimumSuccessRate
    });

    if (!transition) {
      return null;
    }

    return {
      action: transition.action,
      expectedNextState: { stateId: transition.toStateHash },
      confidence: confidenceFromSuccessRate(transition.successRate, transition.successCount),
      source: this.source,
      reason: "Matched a learned transition for the current compact state.",
      transitionId: transition.id
    };
  }
}
