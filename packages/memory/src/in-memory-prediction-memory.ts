import { randomUUID } from "node:crypto";
import type {
  AgentTaskError,
  FindTransitionInput,
  LearnedTransition,
  SaveTransitionInput,
  TransitionMetrics
} from "./models/learned-transition";
import type { PredictionMemory } from "./prediction-memory";

export class InMemoryPredictionMemory implements PredictionMemory {
  private readonly transitions = new Map<string, LearnedTransition>();

  async findBestTransition(input: FindTransitionInput): Promise<LearnedTransition | null> {
    const minimumSuccessRate = input.minimumSuccessRate ?? 0;
    const candidates = Array.from(this.transitions.values()).filter((transition) => {
      if (transition.fromStateHash !== input.fromStateHash) {
        return false;
      }

      if (input.siteKey && transition.siteKey !== input.siteKey) {
        return false;
      }

      if (input.goalHash && transition.goalHash !== input.goalHash) {
        return false;
      }

      return transition.successRate >= minimumSuccessRate;
    });

    candidates.sort(compareTransitions);

    return candidates[0] ?? null;
  }

  async saveTransition(input: SaveTransitionInput): Promise<LearnedTransition> {
    const existing = Array.from(this.transitions.values()).find(
      (transition) =>
        transition.fromStateHash === input.fromStateHash &&
        transition.toStateHash === input.toStateHash &&
        transition.siteKey === input.siteKey &&
        transition.goalHash === input.goalHash &&
        JSON.stringify(transition.action) === JSON.stringify(input.action)
    );

    if (existing) {
      const updated = applySuccess(existing, input.latencyMs ?? existing.avgLatencyMs, input.observedAt ?? new Date());
      this.transitions.set(updated.id, updated);
      return updated;
    }

    const observedAt = input.observedAt ?? new Date();
    const transition: LearnedTransition = {
      id: input.id ?? randomUUID(),
      siteKey: input.siteKey,
      goalHash: input.goalHash,
      fromStateHash: input.fromStateHash,
      action: input.action,
      toStateHash: input.toStateHash,
      successCount: 1,
      failureCount: 0,
      successRate: 1,
      avgLatencyMs: input.latencyMs ?? 0,
      lastSeenAt: observedAt,
      createdAt: observedAt
    };

    this.transitions.set(transition.id, transition);
    return transition;
  }

  async markSuccess(id: string, metrics: TransitionMetrics): Promise<void> {
    const transition = this.transitions.get(id);

    if (!transition) {
      return;
    }

    this.transitions.set(id, applySuccess(transition, metrics.latencyMs, new Date()));
  }

  async markFailure(id: string, _error: AgentTaskError): Promise<void> {
    const transition = this.transitions.get(id);

    if (!transition) {
      return;
    }

    const failureCount = transition.failureCount + 1;
    this.transitions.set(id, {
      ...transition,
      failureCount,
      successRate: transition.successCount / (transition.successCount + failureCount),
      lastSeenAt: new Date()
    });
  }
}

export function createInMemoryPredictionMemory(): PredictionMemory {
  return new InMemoryPredictionMemory();
}

function compareTransitions(a: LearnedTransition, b: LearnedTransition): number {
  return (
    b.successRate - a.successRate ||
    b.successCount - a.successCount ||
    b.lastSeenAt.getTime() - a.lastSeenAt.getTime()
  );
}

function applySuccess(transition: LearnedTransition, latencyMs: number, lastSeenAt: Date): LearnedTransition {
  const successCount = transition.successCount + 1;
  const totalLatency = transition.avgLatencyMs * transition.successCount + latencyMs;

  return {
    ...transition,
    successCount,
    successRate: successCount / (successCount + transition.failureCount),
    avgLatencyMs: totalLatency / successCount,
    lastSeenAt
  };
}
