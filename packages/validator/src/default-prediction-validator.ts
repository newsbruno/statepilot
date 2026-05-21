import { calculateEnergyScore } from "./energy/energy-score";
import type { EnergyScore } from "./energy/energy-score";
import type { PredictionValidator, ValidationInput, ValidationResult } from "./prediction-validator";

export interface DefaultPredictionValidatorOptions {
  readonly successThreshold?: number;
  readonly uncertainThreshold?: number;
}

export class DefaultPredictionValidator implements PredictionValidator {
  private readonly successThreshold: number;
  private readonly uncertainThreshold: number;

  constructor(options: DefaultPredictionValidatorOptions = {}) {
    this.successThreshold = options.successThreshold ?? 0.25;
    this.uncertainThreshold = options.uncertainThreshold ?? 0.55;
  }

  async validate(input: ValidationInput): Promise<ValidationResult> {
    const energy = calculateEnergyScore({
      previousState: input.previousState,
      action: input.action,
      expected: input.expectedNextState,
      actual: input.actualNextState
    });

    const mismatchReasons = buildMismatchReasons(energy);
    const ok = energy.total <= this.uncertainThreshold;
    const confidence = energy.total <= this.successThreshold ? 1 - energy.total : Math.max(0.25, 1 - energy.total);

    return {
      ok,
      confidence,
      energy,
      mismatchReasons
    };
  }
}

export function createDefaultPredictionValidator(options?: DefaultPredictionValidatorOptions): PredictionValidator {
  return new DefaultPredictionValidator(options);
}

function buildMismatchReasons(energy: EnergyScore): string[] {
  const reasons: string[] = [];

  if ((energy.urlDistance ?? 0) > 0) {
    reasons.push("url diverged");
  }

  if ((energy.domDistance ?? 0) > 0) {
    reasons.push("dom diverged");
  }

  if ((energy.textDistance ?? 0) > 0) {
    reasons.push("visible text diverged");
  }

  if ((energy.elementDistance ?? 0) > 0) {
    reasons.push("required elements missing");
  }

  if ((energy.semanticDistance ?? 0) > 0) {
    reasons.push("semantic hash diverged");
  }

  return reasons;
}
