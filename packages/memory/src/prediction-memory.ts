import type {
  AgentTaskError,
  FindTransitionInput,
  LearnedTransition,
  SaveTransitionInput,
  TransitionMetrics
} from "./models/learned-transition";

export interface PredictionMemory {
  findBestTransition(input: FindTransitionInput): Promise<LearnedTransition | null>;
  saveTransition(transition: SaveTransitionInput): Promise<LearnedTransition>;
  markSuccess(id: string, metrics: TransitionMetrics): Promise<void>;
  markFailure(id: string, error: AgentTaskError): Promise<void>;
}
