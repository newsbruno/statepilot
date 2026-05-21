export type AgentAction =
  | ClickAction
  | FillAction
  | PressAction
  | WaitForAction
  | NavigateAction
  | ExtractAction
  | UploadFileAction
  | SelectAction
  | NoopAction;

export interface BaseAction {
  readonly timeoutMs?: number;
}

export interface ClickAction extends BaseAction {
  readonly type: "click";
  readonly selector: string;
  readonly elementId?: string;
}

export interface FillAction extends BaseAction {
  readonly type: "fill";
  readonly selector: string;
  readonly value: string;
  readonly sensitive?: boolean;
}

export interface PressAction extends BaseAction {
  readonly type: "press";
  readonly key: string;
}

export interface WaitForAction extends BaseAction {
  readonly type: "wait_for";
  readonly condition: WaitCondition;
}

export interface NavigateAction extends BaseAction {
  readonly type: "navigate";
  readonly url: string;
}

export interface ExtractAction extends BaseAction {
  readonly type: "extract";
  readonly schema: Record<string, unknown>;
  readonly source?: "dom" | "text" | "screenshot" | "mixed";
}

export interface UploadFileAction extends BaseAction {
  readonly type: "upload_file";
  readonly selector: string;
  readonly filePath: string;
  readonly sensitive?: boolean;
}

export interface SelectAction extends BaseAction {
  readonly type: "select";
  readonly selector: string;
  readonly value: string;
}

export interface NoopAction extends BaseAction {
  readonly type: "noop";
  readonly reason?: string;
}

export type WaitCondition =
  | { readonly type: "selector"; readonly selector: string; readonly state?: "attached" | "visible" | "hidden" }
  | { readonly type: "url"; readonly value: string | RegExp }
  | { readonly type: "timeout"; readonly ms: number }
  | { readonly type: "network_idle" };

export function maskAction(action: AgentAction): AgentAction {
  if (action.type === "fill" && action.sensitive) {
    return { ...action, value: "********" };
  }

  if (action.type === "upload_file" && action.sensitive) {
    return { ...action, filePath: "********" };
  }

  return action;
}

export function actionSummary(action: AgentAction): string {
  const safeAction = maskAction(action);

  switch (safeAction.type) {
    case "click":
      return `click ${safeAction.selector}`;
    case "fill":
      return `fill ${safeAction.selector}`;
    case "press":
      return `press ${safeAction.key}`;
    case "wait_for":
      return `wait_for ${safeAction.condition.type}`;
    case "navigate":
      return `navigate ${safeAction.url}`;
    case "extract":
      return `extract ${safeAction.source ?? "mixed"}`;
    case "upload_file":
      return `upload_file ${safeAction.selector}`;
    case "select":
      return `select ${safeAction.selector}`;
    case "noop":
      return `noop ${safeAction.reason ?? "no reason"}`;
  }
}
