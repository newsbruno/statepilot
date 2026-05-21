import type { AgentTaskError } from "./task-error";

export type AgentTaskStatus = "success" | "failed" | "cancelled" | "timeout";

export interface TaskMetrics {
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly durationMs: number;
  readonly actionsCount: number;
  readonly predictionConfidenceAverage: number;
  readonly llmCallsCount: number;
  readonly recoveryCount: number;
}

export interface AgentTaskResult<TResult = unknown> {
  readonly taskId: string;
  readonly status: AgentTaskStatus;
  readonly result?: TResult;
  readonly error?: AgentTaskError;
  readonly metrics: TaskMetrics;
}
