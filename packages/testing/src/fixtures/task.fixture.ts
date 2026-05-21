import type { AgentTask } from "@statepilot/core";

export function mockTask<TInput = Record<string, unknown>>(overrides: Partial<AgentTask<TInput>> = {}): AgentTask<TInput> {
  return {
    id: "task-1",
    goal: "Open page",
    siteKey: "demo",
    input: { url: "https://example.com" } as TInput,
    priority: "normal",
    timeoutMs: 30_000,
    retryLimit: 1,
    createdAt: new Date("2026-05-20T00:00:00.000Z"),
    ...overrides
  };
}
