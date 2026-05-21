import type { AgentAction } from "@statepilot/action-model";

export function mockClickAction(overrides: Partial<Extract<AgentAction, { type: "click" }>> = {}): AgentAction {
  return {
    type: "click",
    selector: "button",
    ...overrides
  };
}

export function mockNavigateAction(
  overrides: Partial<Extract<AgentAction, { type: "navigate" }>> = {}
): AgentAction {
  return {
    type: "navigate",
    url: "https://example.com",
    ...overrides
  };
}
