import type { AgentTargetId } from "../installer/types";
import { callStatePilotTool } from "../mcp/tools";
import { isJsonObject, type JsonObject, type JsonValue } from "../utils/json";

export type AgentSmokeTarget = AgentTargetId | "all";

export interface AgentSmokeOptions {
  readonly target?: AgentSmokeTarget;
  readonly url?: string;
  readonly topic?: string;
  readonly limit?: number;
  readonly useMock?: boolean;
  readonly maxResponseBytes?: number;
}

const AGENT_TARGETS: readonly AgentTargetId[] = ["claude", "cursor", "codex", "opencode"];
const DEFAULT_SMOKE_URL = "https://techcrunch.com/category/artificial-intelligence/";
const DEFAULT_SMOKE_TOPIC = "AI startup news";
const DEFAULT_SMOKE_LIMIT = 5;
const DEFAULT_MAX_RESPONSE_BYTES = 20_000;

export function isAgentSmokeTarget(value: string): value is AgentSmokeTarget {
  return value === "all" || AGENT_TARGETS.includes(value as AgentTargetId);
}

export function createAgentSmokeArguments(options: AgentSmokeOptions = {}): JsonObject {
  return {
    url: options.url ?? DEFAULT_SMOKE_URL,
    topic: options.topic ?? DEFAULT_SMOKE_TOPIC,
    limit: options.limit ?? DEFAULT_SMOKE_LIMIT,
    includeEvidence: true,
    responseMode: "compact",
    smokeMode: true,
    maxClaimsPerArticle: 3,
    maxCitationsPerArticle: 3,
    maxSnippetChars: 240,
    maxResponseBytes: options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    headless: true,
    timeoutMs: 60_000,
    useMock: options.useMock === true
  };
}

export function createAgentSmokePrompt(target: AgentTargetId, options: AgentSmokeOptions = {}): string {
  const argumentsObject = createAgentSmokeArguments({ ...options, useMock: false });

  return [
    `StatePilot real-agent smoke test for ${agentLabel(target)}.`,
    "",
    "Use StatePilot statepilot_research_site with these exact arguments:",
    "",
    JSON.stringify(argumentsObject, null, 2),
    "",
    "Return the JSON object with no prose before it and no prose after it. Prefer raw JSON. If your agent interface automatically wraps JSON in a single ```json code block, the JSON inside that block must still be complete and parseable.",
    "",
    "Use this exact top-level shape:",
    "",
    JSON.stringify(
      {
        toolResult: {},
        smoke: {
          status: "pass",
          usedShell: false,
          readToolResultFiles: false,
          notes: []
        }
      },
      null,
      2
    ),
    "",
    "`toolResult` must be the complete StatePilot tool JSON object exactly as returned by the MCP tool. This is a compact smoke-mode payload, so it should fit inline without reading saved tool-result files.",
    "",
    "Do not summarize, abbreviate, redact, collapse, or replace any JSON field with placeholders. Forbidden examples include `{...}`, `[...]`, `[5 articles]`, `[5 articles with fields]`, or `indexMetrics: {...}`.",
    "",
    "If you cannot include the complete tool JSON inline, return the same JSON envelope with `smoke.status` set to `fail` and explain why in `smoke.notes`. Do not pretend the smoke test passed.",
    "",
    "Pass criteria:",
    "- The tool result has status success.",
    "- toolResult.smokeMode is true.",
    "- source.responseMode is compact.",
    "- articles contains at least one article check.",
    "- smoke.status is pass.",
    "- The final response contains a complete parseable JSON object, either raw or inside one JSON code block.",
    "- toolResult is complete and contains no placeholder summaries.",
    "- The agent does not read tool-result files.",
    "- The agent does not run shell, Python, cat, grep, jq, or any external post-processing command.",
    "",
    "If the tool output is too large for the agent context, report that as a StatePilot smoke failure. Do not work around it by reading files or running shell commands."
  ].join("\n");
}

export function createAgentSmokePrompts(options: AgentSmokeOptions = {}): JsonObject {
  return Object.fromEntries(
    resolveAgentTargets(options.target ?? "all").map((target) => [target, createAgentSmokePrompt(target, options)])
  );
}

export async function runAgentSmokeSuite(options: AgentSmokeOptions = {}): Promise<JsonObject> {
  const target = options.target ?? "all";
  const useMock = options.useMock !== false;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const argumentsObject = createAgentSmokeArguments({ ...options, useMock });
  const result = asJsonObject(await callStatePilotTool("statepilot_research_site", argumentsObject));
  const serialized = JSON.stringify(result);
  const responseBytes = Buffer.byteLength(serialized, "utf8");
  const source = asJsonObject(result.source);
  const smoke = asJsonObject(result.smoke);
  const articles = asJsonArray(result.articles);
  const failures = asJsonArray(result.failures);
  const firstArticle = asJsonObject(articles[0]);
  const toolChecks = asJsonArray(smoke.checks);
  const checks = [
    createCheck("tool_status_success", result.status === "success", `status=${asString(result.status) ?? "missing"}`),
    createCheck("smoke_mode_enabled", result.smokeMode === true, `smokeMode=${formatBoolean(result.smokeMode)}`),
    createCheck("statepilot_smoke_pass", smoke.status === "pass", `smoke.status=${asString(smoke.status) ?? "missing"}`),
    createCheck(
      "compact_response_mode",
      source.responseMode === "compact",
      `source.responseMode=${asString(source.responseMode) ?? "missing"}`
    ),
    createCheck("article_returned", articles.length > 0, `articles=${articles.length}`),
    createCheck("links_selected", asNumber(source.linksSelected) > 0, `linksSelected=${asNumber(source.linksSelected)}`),
    createCheck(
      "claims_returned",
      firstArticle.hasClaims === true,
      `firstArticle.hasClaims=${formatBoolean(firstArticle.hasClaims)}`
    ),
    createCheck(
      "citations_returned",
      firstArticle.hasCitations === true,
      `firstArticle.hasCitations=${formatBoolean(firstArticle.hasCitations)}`
    ),
    createCheck("no_failures", failures.length === 0, `failures=${failures.length}`),
    createCheck("response_budget", responseBytes <= maxResponseBytes, `responseBytes=${responseBytes}`),
    createCheck("tool_checks_returned", toolChecks.length > 0, `toolChecks=${toolChecks.length}`),
    createCheck("no_claim_text_payload", !serialized.includes('"claims":['), "smoke mode should omit claim text"),
    createCheck("no_citation_payload", !serialized.includes('"citations":['), "smoke mode should omit citation text"),
    createCheck("no_raw_article_payload", !serialized.includes('"article":{'), "smoke mode should omit raw article")
  ];
  const passed = checks.every((check) => check.status === "pass");

  return {
    status: passed ? "pass" : "fail",
    mode: useMock ? "mock" : "real",
    target,
    targets: resolveAgentTargets(target),
    promptTargets: resolveAgentTargets(target),
    tool: "statepilot_research_site",
    arguments: argumentsObject,
    checks,
    metrics: {
      responseBytes,
      articlesCount: articles.length,
      selectedLinksCount: asNumber(source.linksSelected),
      failuresCount: failures.length,
      maxResponseBytes
    },
    next: {
      promptCommand: `statepilot smoke prompt --target=${target}`
    }
  };
}

function resolveAgentTargets(target: AgentSmokeTarget): readonly AgentTargetId[] {
  return target === "all" ? AGENT_TARGETS : [target];
}

function agentLabel(target: AgentTargetId): string {
  switch (target) {
    case "claude":
      return "Claude Code";
    case "cursor":
      return "Cursor";
    case "codex":
      return "Codex CLI";
    case "opencode":
      return "opencode";
  }
}

function createCheck(name: string, passed: boolean, message: string): JsonObject {
  return {
    name,
    status: passed ? "pass" : "fail",
    message
  };
}

function asJsonObject(value: JsonValue | undefined): JsonObject {
  return isJsonObject(value) ? value : {};
}

function asJsonArray(value: JsonValue | undefined): readonly JsonValue[] {
  return isJsonArray(value) ? value : [];
}

function asString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: JsonValue | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatBoolean(value: JsonValue | undefined): string {
  return typeof value === "boolean" ? String(value) : "missing";
}

function isJsonArray(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}
