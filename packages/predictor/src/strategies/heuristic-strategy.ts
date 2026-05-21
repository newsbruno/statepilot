import type { AgentAction } from "@statepilot/action-model";
import type { ElementSignature } from "@statepilot/browser-state";
import type { PredictionStrategy } from "../prediction-engine";
import type { Prediction } from "../types/prediction";
import type { PredictionInput } from "../types/prediction-input";

export class HeuristicStrategy implements PredictionStrategy {
  readonly source = "heuristic" as const;

  async predict(input: PredictionInput): Promise<Prediction | null> {
    const navigation = predictNavigation(input);
    if (navigation) {
      return navigation;
    }

    const fill = predictFill(input);
    if (fill) {
      return fill;
    }

    const extract = predictExtract(input);
    if (extract) {
      return extract;
    }

    const click = predictClick(input);
    if (click) {
      return click;
    }

    return {
      action: { type: "noop", reason: "No confident heuristic matched the current state." },
      confidence: 0.1,
      source: this.source,
      reason: "No heuristic match."
    };
  }
}

function predictNavigation(input: PredictionInput): Prediction | null {
  const taskInput = asRecord(input.task.input);
  const url = typeof taskInput.url === "string" ? taskInput.url : undefined;

  if (!url) {
    return null;
  }

  if (input.currentState.url === "about:blank" || input.previousActions.length === 0) {
    return {
      action: { type: "navigate", url },
      expectedNextState: { url },
      confidence: 0.9,
      source: "heuristic",
      reason: "Task input includes a target URL."
    };
  }

  return null;
}

function predictFill(input: PredictionInput): Prediction | null {
  const taskInput = asRecord(input.task.input);
  const filledSelectors = new Set(
    input.previousActions.filter(isFillAction).map((action) => action.selector)
  );

  for (const element of input.currentState.interactiveElements) {
    if (!isFillable(element) || filledSelectors.has(element.selector)) {
      continue;
    }

    const value = findInputValue(element, taskInput);
    if (!value) {
      continue;
    }

    return {
      action: {
        type: "fill",
        selector: element.selector,
        value,
        sensitive: isSensitiveField(element)
      },
      confidence: isSensitiveField(element) ? 0.82 : 0.74,
      source: "heuristic",
      reason: "Matched a fillable element to task input."
    };
  }

  return null;
}

function predictClick(input: PredictionInput): Prediction | null {
  const goal = input.task.goal.toLowerCase();
  const candidates = input.currentState.interactiveElements.filter(
    (element) =>
      element.visible &&
      element.enabled &&
      (element.role === "button" || element.role === "link") &&
      !isLikelySkipLink(element)
  );

  const preferred = candidates.find((element) => goalMatchesElement(goal, element)) ?? candidates[0];

  if (!preferred) {
    return null;
  }

  return {
    action: {
      type: "click",
      selector: preferred.selector,
      elementId: preferred.id
    },
    confidence: goalMatchesElement(goal, preferred) ? 0.78 : 0.55,
    source: "heuristic",
    reason: "Selected a visible actionable element."
  };
}

function predictExtract(input: PredictionInput): Prediction | null {
  const goal = input.task.goal.toLowerCase();
  const hasTable = input.currentState.interactiveElements.some((element) => element.role === "table");

  if (!hasTable && !hasExtractionGoal(goal)) {
    return null;
  }

  return {
    action: {
      type: "extract",
      schema: {},
      source: hasTable ? "dom" : "mixed"
    },
    confidence: hasTable ? 0.7 : 0.62,
    source: "heuristic",
    reason: "Goal or state suggests extraction."
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

function findInputValue(element: ElementSignature, taskInput: Record<string, unknown>): string | null {
  const label = elementLabel(element);

  for (const [key, value] of Object.entries(taskInput)) {
    if (typeof value !== "string" && typeof value !== "number") {
      continue;
    }

    const normalizedKey = key.toLowerCase();
    if (label.includes(normalizedKey) || synonymsFor(normalizedKey).some((synonym) => label.includes(synonym))) {
      return String(value);
    }
  }

  return null;
}

function elementLabel(element: ElementSignature): string {
  return [element.text, element.ariaLabel, element.placeholder, element.name, element.selector]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

function goalMatchesElement(goal: string, element: ElementSignature): boolean {
  const label = elementLabel(element);
  const words = [
    "login",
    "entrar",
    "submit",
    "enviar",
    "search",
    "buscar",
    "pesquisar",
    "continuar",
    "continue",
    "next"
  ];

  return words.some((word) => goal.includes(word) && label.includes(word));
}

function isLikelySkipLink(element: ElementSignature): boolean {
  return /\b(skip|skip-link|skip_to|skip-to|wp-skip-link|screen-reader-text)\b/.test(elementLabel(element));
}

function synonymsFor(key: string): readonly string[] {
  if (["email", "user", "username", "login"].includes(key)) {
    return ["email", "usuario", "usuário", "login"];
  }

  if (["password", "senha"].includes(key)) {
    return ["password", "senha"];
  }

  if (["query", "search", "process", "processnumber"].includes(key)) {
    return ["query", "search", "buscar", "pesquisar", "processo"];
  }

  return [];
}

function isFillable(element: ElementSignature): boolean {
  return element.visible && element.enabled && ["input", "textarea"].includes(element.role);
}

function isSensitiveField(element: ElementSignature): boolean {
  return elementLabel(element).includes("password") || elementLabel(element).includes("senha");
}

function isFillAction(action: AgentAction): action is Extract<AgentAction, { type: "fill" }> {
  return action.type === "fill";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
