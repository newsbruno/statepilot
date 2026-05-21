export type TaskPriority = "low" | "normal" | "high" | "critical";

export interface AgentTask<TInput = unknown> {
  readonly id: string;
  readonly goal: string;
  readonly siteKey?: string;
  readonly input: TInput;
  readonly priority: TaskPriority;
  readonly timeoutMs: number;
  readonly retryLimit: number;
  readonly createdAt: Date;
}
