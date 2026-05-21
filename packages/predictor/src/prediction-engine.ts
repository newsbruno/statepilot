import type { Prediction } from "./types/prediction";
import type { PredictionInput } from "./types/prediction-input";
import type { PredictionSource } from "./types/prediction-source";

export interface PredictionEngine {
  predict(input: PredictionInput): Promise<Prediction>;
}

export interface PredictionStrategy {
  readonly source: PredictionSource;
  predict(input: PredictionInput): Promise<Prediction | null>;
}
