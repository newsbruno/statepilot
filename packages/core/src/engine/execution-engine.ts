import { performance } from "node:perf_hooks";
import type { AgentAction } from "@statepilot/action-model";
import { createTextHash, type BrowserState, type StateEncoder } from "@statepilot/browser-state";
import type { PredictionMemory } from "@statepilot/memory";
import type { PredictionEngine } from "@statepilot/predictor";
import type { PredictionValidator } from "@statepilot/validator";
import type { BrowserAdapter, BrowserPage, BrowserSessionConfig, ExtractionOptions } from "../browser/browser-adapter";
import type { AgentTask } from "../task/agent-task";
import type { AgentTaskResult, TaskMetrics } from "../task/task-result";
import { toAgentTaskError } from "../task/task-error";

export interface ExecutionEngine {
  run<TInput, TResult = unknown>(task: AgentTask<TInput>): Promise<AgentTaskResult<TResult>>;
}

export interface ExecutionEngineOptions {
  readonly adapter: BrowserAdapter;
  readonly memory?: PredictionMemory;
  readonly predictor: PredictionEngine;
  readonly stateEncoder: StateEncoder;
  readonly validator: PredictionValidator;
  readonly session?: BrowserSessionConfig;
  readonly maxActions?: number;
}

interface ActionExecutionResult {
  readonly result?: unknown;
}

export class SimpleExecutionEngine implements ExecutionEngine {
  private readonly adapter: BrowserAdapter;
  private readonly memory?: PredictionMemory;
  private readonly predictor: PredictionEngine;
  private readonly stateEncoder: StateEncoder;
  private readonly validator: PredictionValidator;
  private readonly session?: BrowserSessionConfig;
  private readonly maxActions: number;

  constructor(options: ExecutionEngineOptions) {
    this.adapter = options.adapter;
    this.memory = options.memory;
    this.predictor = options.predictor;
    this.stateEncoder = options.stateEncoder;
    this.validator = options.validator;
    this.session = options.session;
    this.maxActions = options.maxActions ?? 12;
  }

  async run<TInput, TResult = unknown>(task: AgentTask<TInput>): Promise<AgentTaskResult<TResult>> {
    const startedAt = new Date();
    const started = performance.now();
    const confidences: number[] = [];
    const previousActions: AgentAction[] = [];
    const session = await this.adapter.createSession(this.session);

    try {
      const page = await session.openPage();
      let currentState = await this.captureState(page);
      let lastResult: unknown;

      for (let step = 0; step < this.maxActions; step += 1) {
        if (performance.now() - started > task.timeoutMs) {
          return this.finish<TResult>(task.id, "timeout", startedAt, started, previousActions.length, confidences, undefined, {
            code: "task_timeout",
            message: `Task exceeded timeout of ${task.timeoutMs}ms`,
            retryable: task.retryLimit > 0
          });
        }

        const prediction = await this.predictor.predict({
          task,
          currentState,
          memory: this.memory,
          previousActions
        });
        confidences.push(prediction.confidence);

        if (prediction.action.type === "noop") {
          return this.finish<TResult>(
            task.id,
            "success",
            startedAt,
            started,
            previousActions.length,
            confidences,
            lastResult as TResult
          );
        }

        const actionStarted = performance.now();
        let execution: ActionExecutionResult;

        try {
          execution = await executeAction(page, prediction.action, task);
        } catch (error) {
          if (prediction.transitionId && this.memory) {
            await this.memory.markFailure(prediction.transitionId, toAgentTaskError(error));
          }

          if (prediction.action.type === "click" && hasExtractionGoal(task.goal)) {
            const fallbackAction: AgentAction = { type: "extract", schema: {}, source: "mixed" };
            const fallbackExecution = await executeAction(page, fallbackAction, task);
            lastResult = fallbackExecution.result ?? lastResult;
            previousActions.push(fallbackAction);

            return this.finish<TResult>(
              task.id,
              "success",
              startedAt,
              started,
              previousActions.length,
              confidences,
              lastResult as TResult
            );
          }

          throw error;
        }

        const latencyMs = performance.now() - actionStarted;
        lastResult = execution.result ?? lastResult;

        const nextState = await this.captureState(page);
        const validation = await this.validator.validate({
          previousState: currentState,
          action: prediction.action,
          expectedNextState: prediction.expectedNextState,
          actualNextState: nextState
        });

        if (!validation.ok) {
          if (prediction.transitionId && this.memory) {
            await this.memory.markFailure(prediction.transitionId, {
              code: "validation_failed",
              message: validation.mismatchReasons.join(", ") || "Prediction validation failed"
            });
          }

          return this.finish<TResult>(
            task.id,
            "failed",
            startedAt,
            started,
            previousActions.length,
            confidences,
            undefined,
            {
              code: "validation_failed",
              message: validation.mismatchReasons.join(", ") || "Prediction validation failed",
              retryable: true
            }
          );
        }

        if (this.memory) {
          await this.memory.saveTransition({
            siteKey: task.siteKey,
            goalHash: createTextHash(task.goal),
            fromStateHash: currentState.id,
            action: prediction.action,
            toStateHash: nextState.id,
            latencyMs
          });
        }

        previousActions.push(prediction.action);
        currentState = nextState;

        if (prediction.action.type === "extract") {
          return this.finish<TResult>(
            task.id,
            "success",
            startedAt,
            started,
            previousActions.length,
            confidences,
            lastResult as TResult
          );
        }
      }

      return this.finish<TResult>(task.id, "failed", startedAt, started, previousActions.length, confidences, undefined, {
        code: "max_actions_exceeded",
        message: `Execution exceeded maxActions=${this.maxActions}`,
        retryable: true
      });
    } catch (error) {
      return this.finish<TResult>(
        task.id,
        "failed",
        startedAt,
        started,
        previousActions.length,
        confidences,
        undefined,
        toAgentTaskError(error)
      );
    } finally {
      await session.close();
    }
  }

  private async captureState(page: BrowserPage): Promise<BrowserState> {
    return this.stateEncoder.encode(await page.getState());
  }

  private finish<TResult>(
    taskId: string,
    status: AgentTaskResult<TResult>["status"],
    startedAt: Date,
    started: number,
    actionsCount: number,
    confidences: readonly number[],
    result?: TResult,
    error?: AgentTaskResult<TResult>["error"]
  ): AgentTaskResult<TResult> {
    const completedAt = new Date();
    return {
      taskId,
      status,
      result,
      error,
      metrics: createMetrics(startedAt, completedAt, performance.now() - started, actionsCount, confidences)
    };
  }
}

async function executeAction(page: BrowserPage, action: AgentAction, task: AgentTask<unknown>): Promise<ActionExecutionResult> {
  switch (action.type) {
    case "click":
      await page.click(action.selector);
      return {};
    case "fill":
      await page.fill(action.selector, action.value);
      return {};
    case "press":
      await page.press(action.key);
      return {};
    case "wait_for":
      await page.waitFor(action.condition);
      return {};
    case "navigate":
      await page.goto(action.url);
      return {};
    case "extract":
      return { result: await page.extractPage(createExtractionOptions(task)) };
    case "upload_file":
      throw new Error("upload_file is not implemented by the core executor yet");
    case "select":
      throw new Error("select is not implemented by the core executor yet");
    case "noop":
      return {};
  }
}

function createExtractionOptions(task: AgentTask<unknown>): ExtractionOptions {
  const taskInput = asRecord(task.input);
  const articleMode = taskInput.articleMode === true || hasArticleGoal(task.goal) || isLikelyArticleUrl(taskInput.url);

  return {
    articleMode,
    includeEvidence: taskInput.includeEvidence === true || articleMode,
    maxLinks: typeof taskInput.maxLinks === "number" && Number.isFinite(taskInput.maxLinks) ? taskInput.maxLinks : undefined
  };
}

function createMetrics(
  startedAt: Date,
  completedAt: Date,
  durationMs: number,
  actionsCount: number,
  confidences: readonly number[]
): TaskMetrics {
  const predictionConfidenceAverage =
    confidences.length === 0
      ? 0
      : confidences.reduce((total, confidence) => total + confidence, 0) / confidences.length;

  return {
    startedAt,
    completedAt,
    durationMs,
    actionsCount,
    predictionConfidenceAverage,
    llmCallsCount: 0,
    recoveryCount: 0
  };
}

function hasExtractionGoal(goal: string): boolean {
  return (
    /\b(extract|read|scrape|summari[sz]e|return|get|capture|collect)\b.*\b(text|content|copy|headlines?|article|page|url|author|date|summary)\b/i.test(
      goal
    ) ||
    /\b(research|collect|find|list|scan)\b.*\b(news|articles?|links?|urls?|headlines?|posts?|stories)\b/i.test(goal) ||
    /\b(page text|body text|visible text|text from|companies mentioned|conte[uú]do|texto|dados|tabela|table|document)\b/i.test(
      goal
    )
  );
}

function hasArticleGoal(goal: string): boolean {
  return /\b(article|author|byline|published|published at|date|paragraphs?|funding|investors?|companies mentioned|startup profile|briefing)\b/i.test(
    goal
  );
}

function isLikelyArticleUrl(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);
    return /\/20\d{2}\/\d{2}\/\d{2}\//.test(url.pathname);
  } catch {
    return false;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
