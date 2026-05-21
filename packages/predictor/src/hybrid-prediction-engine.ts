import type { PredictionMemory } from "@statepilot/memory";
import type { AgentAction } from "@statepilot/action-model";
import type { BrowserState, ElementSignature, ViewportInfo } from "@statepilot/browser-state";
import type { PredictionEngine, PredictionStrategy } from "./prediction-engine";
import { HeuristicStrategy } from "./strategies/heuristic-strategy";
import { TransitionMemoryStrategy } from "./strategies/transition-memory-strategy";
import type { Prediction } from "./types/prediction";
import type { PredictionInput } from "./types/prediction-input";

export interface HybridPredictionEngineOptions {
  readonly memory?: PredictionMemory;
  readonly strategies?: readonly PredictionStrategy[];
  readonly minimumMemorySuccessRate?: number;
}

export class HybridPredictionEngine implements PredictionEngine {
  private readonly strategies: readonly PredictionStrategy[];

  constructor(options: HybridPredictionEngineOptions = {}) {
    const memoryStrategies = options.memory
      ? [
          new TransitionMemoryStrategy({
            memory: options.memory,
            minimumSuccessRate: options.minimumMemorySuccessRate
          })
        ]
      : [];

    this.strategies = [...memoryStrategies, ...(options.strategies ?? [new HeuristicStrategy()])];
  }

  async predict(input: PredictionInput): Promise<Prediction> {
    const predictions: Prediction[] = [];

    for (const strategy of this.strategies) {
      const prediction = await strategy.predict(input);
      if (prediction) {
        predictions.push(prediction);
      }
    }

    const viablePredictions = predictions.filter((prediction) => isPredictionViable(prediction, input));
    const candidates = viablePredictions.length > 0 ? viablePredictions : predictions;

    const navigation = candidates.find((prediction) => prediction.action.type === "navigate");
    if (navigation && shouldStartWithNavigation(input)) {
      return navigation;
    }

    const extraction = candidates.find((prediction) => prediction.action.type === "extract");
    if (extraction && shouldPreferExtraction(input)) {
      return extraction;
    }

    candidates.sort((a, b) => b.confidence - a.confidence);

    return (
      candidates[0] ?? {
        action: { type: "noop", reason: "No prediction strategy returned an action." },
        confidence: 0,
        source: "heuristic",
        reason: "No prediction available."
      }
    );
  }
}

export function createHybridPredictionEngine(options?: HybridPredictionEngineOptions): PredictionEngine {
  return new HybridPredictionEngine(options);
}

function shouldStartWithNavigation(input: PredictionInput): boolean {
  const taskInput = asRecord(input.task.input);
  const hasTargetUrl = typeof taskInput.url === "string";

  return hasTargetUrl && (input.currentState.url === "about:blank" || input.previousActions.length === 0);
}

function shouldPreferExtraction(input: PredictionInput): boolean {
  return input.currentState.url !== "about:blank" && hasExtractionGoal(input.task.goal);
}

function isPredictionViable(prediction: Prediction, input: PredictionInput): boolean {
  if (prediction.action.type !== "click") {
    return true;
  }

  return isClickActionViable(prediction.action, input.currentState);
}

function isClickActionViable(action: Extract<AgentAction, { type: "click" }>, state: BrowserState): boolean {
  const element = state.interactiveElements.find(
    (candidate) =>
      candidate.selector === action.selector ||
      candidate.stableSelector === action.selector ||
      candidate.id === action.elementId
  );

  if (!element) {
    return true;
  }

  return isElementActionable(element, state.viewport) && !isLikelySkipLink(element);
}

function isElementActionable(element: ElementSignature, viewport: ViewportInfo): boolean {
  if (!element.visible || !element.enabled) {
    return false;
  }

  if (!element.bbox) {
    return true;
  }

  const right = element.bbox.x + element.bbox.width;
  const bottom = element.bbox.y + element.bbox.height;

  return element.bbox.width > 0 && element.bbox.height > 0 && right > 0 && bottom > 0 && element.bbox.x < viewport.width;
}

function isLikelySkipLink(element: ElementSignature): boolean {
  const label = [element.selector, element.stableSelector, element.text, element.ariaLabel, element.name]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  return /\b(skip|skip-link|skip_to|skip-to|wp-skip-link|screen-reader-text)\b/.test(label);
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
