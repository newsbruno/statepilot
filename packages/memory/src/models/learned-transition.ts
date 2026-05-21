import type { AgentAction } from "@statepilot/action-model";

export interface LearnedTransition {
  readonly id: string;
  readonly siteKey?: string;
  readonly goalHash?: string;
  readonly fromStateHash: string;
  readonly action: AgentAction;
  readonly toStateHash: string;
  readonly successCount: number;
  readonly failureCount: number;
  readonly successRate: number;
  readonly avgLatencyMs: number;
  readonly lastSeenAt: Date;
  readonly createdAt: Date;
}

export interface FindTransitionInput {
  readonly siteKey?: string;
  readonly goalHash?: string;
  readonly fromStateHash: string;
  readonly minimumSuccessRate?: number;
}

export interface SaveTransitionInput {
  readonly id?: string;
  readonly siteKey?: string;
  readonly goalHash?: string;
  readonly fromStateHash: string;
  readonly action: AgentAction;
  readonly toStateHash: string;
  readonly latencyMs?: number;
  readonly observedAt?: Date;
}

export interface TransitionMetrics {
  readonly latencyMs: number;
}

export interface AgentTaskError {
  readonly code: string;
  readonly message: string;
  readonly cause?: unknown;
  readonly retryable?: boolean;
}
