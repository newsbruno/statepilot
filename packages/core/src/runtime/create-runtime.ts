import { createDefaultStateEncoder } from "@statepilot/browser-state";
import { createInMemoryPredictionMemory } from "@statepilot/memory";
import { createHybridPredictionEngine } from "@statepilot/predictor";
import { createDefaultPredictionValidator } from "@statepilot/validator";
import { SimpleExecutionEngine } from "../engine/execution-engine";
import type { AgentTask } from "../task/agent-task";
import type { AgentTaskResult } from "../task/task-result";
import type { RuntimeConfig } from "./runtime-config";

export interface PredictiveBrowserRuntime {
  run<TInput, TResult = unknown>(task: AgentTask<TInput>): Promise<AgentTaskResult<TResult>>;
}

export function createRuntime(config: RuntimeConfig): PredictiveBrowserRuntime {
  const memory = config.memory ?? createInMemoryPredictionMemory();
  const predictor = config.predictor ?? createHybridPredictionEngine({ memory });
  const stateEncoder = config.stateEncoder ?? createDefaultStateEncoder();
  const validator = config.validator ?? createDefaultPredictionValidator();
  const engine = new SimpleExecutionEngine({
    adapter: config.adapter,
    memory,
    predictor,
    stateEncoder,
    validator,
    session: config.session,
    maxActions: config.maxActions
  });

  return {
    run: (task) => engine.run(task)
  };
}
