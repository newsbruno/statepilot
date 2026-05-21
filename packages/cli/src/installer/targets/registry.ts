import { claudeTarget } from "./claude";
import { codexTarget } from "./codex";
import { cursorTarget } from "./cursor";
import { opencodeTarget } from "./opencode";
import type { AgentTarget, AgentTargetId } from "../types";

export const AGENT_TARGETS = [claudeTarget, cursorTarget, codexTarget, opencodeTarget] as const satisfies readonly AgentTarget[];

export function getAgentTarget(id: AgentTargetId): AgentTarget {
  const target = AGENT_TARGETS.find((candidate) => candidate.id === id);
  if (!target) {
    throw new Error(`Unsupported StatePilot agent target: ${id}`);
  }

  return target;
}
