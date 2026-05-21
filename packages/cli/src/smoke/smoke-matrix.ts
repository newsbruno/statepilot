import { join, resolve } from "node:path";
import type { AgentTargetId } from "../installer/types";
import { isJsonObject, readJsonObject, type JsonObject, type JsonValue } from "../utils/json";
import { writeJsonFile, type WriteResult } from "../utils/fs";

export type SmokeRunStatus = "not_run" | "pass" | "fail" | "blocked";

export interface SmokeMatrixOptions {
  readonly projectRoot?: string;
  readonly file?: string;
}

export interface SmokeRecordInput extends SmokeMatrixOptions {
  readonly target: AgentTargetId;
  readonly status: Exclude<SmokeRunStatus, "not_run">;
  readonly responseBytes?: number;
  readonly articlesCount?: number;
  readonly selectedLinksCount?: number;
  readonly failuresCount?: number;
  readonly usedShell?: boolean;
  readonly readToolResultFiles?: boolean;
  readonly notes?: string;
}

export interface SmokeRecordResult {
  readonly write: WriteResult;
  readonly matrix: JsonObject;
}

const MATRIX_SCHEMA_VERSION = 1;
const PROMPT_VERSION = "research-site-smoke-v4";
const MATRIX_TARGETS = ["claude", "cursor", "codex", "opencode"] as const satisfies readonly AgentTargetId[];
const CRITERIA = [
  "Agent calls statepilot_research_site.",
  "Tool result status is success.",
  "Tool result uses smokeMode true.",
  "source.responseMode is compact.",
  "articles contains at least one article check.",
  "toolResult.smoke.status is pass.",
  "Agent returns one complete parseable JSON envelope, raw or inside one JSON code block, with no placeholder summaries.",
  "Agent does not read saved tool-result files.",
  "Agent does not run shell, Python, cat, grep, jq, or external post-processing."
] as const;

const TARGET_LABELS: Record<AgentTargetId, string> = {
  claude: "Claude Code",
  cursor: "Cursor",
  codex: "Codex CLI",
  opencode: "opencode"
};

export function isSmokeRunStatus(value: string): value is SmokeRunStatus {
  return value === "not_run" || value === "pass" || value === "fail" || value === "blocked";
}

export async function getSmokeMatrix(options: SmokeMatrixOptions = {}): Promise<JsonObject> {
  const path = resolveSmokeMatrixPath(options);
  const current = await readJsonObject(path);
  return normalizeSmokeMatrix(current);
}

export async function recordSmokeResult(input: SmokeRecordInput): Promise<SmokeRecordResult> {
  const path = resolveSmokeMatrixPath(input);
  const current = await getSmokeMatrix(input);
  const targets = asJsonObject(current.targets);
  const existingTarget = asJsonObject(targets[input.target]);
  const recordedAt = new Date().toISOString();
  const nextTarget = omitUndefined({
    ...existingTarget,
    target: input.target,
    label: TARGET_LABELS[input.target],
    status: input.status,
    lastRunAt: recordedAt,
    responseBytes: input.responseBytes,
    articlesCount: input.articlesCount,
    selectedLinksCount: input.selectedLinksCount,
    failuresCount: input.failuresCount,
    usedShell: input.usedShell,
    readToolResultFiles: input.readToolResultFiles,
    notes: input.notes
  });
  const matrix = normalizeSmokeMatrix({
    ...current,
    updatedAt: recordedAt,
    targets: {
      ...targets,
      [input.target]: nextTarget
    }
  });
  const write = await writeJsonFile(path, matrix);

  return {
    write,
    matrix
  };
}

export function resolveSmokeMatrixPath(options: SmokeMatrixOptions = {}): string {
  return resolve(options.file ?? join(options.projectRoot ?? process.cwd(), ".statepilot", "smoke-matrix.json"));
}

function normalizeSmokeMatrix(value: JsonObject): JsonObject {
  const targets = asJsonObject(value.targets);

  return {
    schemaVersion: MATRIX_SCHEMA_VERSION,
    promptVersion: PROMPT_VERSION,
    updatedAt: asString(value.updatedAt) ?? null,
    criteria: [...CRITERIA],
    targets: Object.fromEntries(
      MATRIX_TARGETS.map((target) => [target, normalizeTargetRecord(target, asJsonObject(targets[target]))])
    )
  };
}

function normalizeTargetRecord(target: AgentTargetId, value: JsonObject): JsonObject {
  const status = asString(value.status);

  return omitUndefined({
    target,
    label: TARGET_LABELS[target],
    status: status && isSmokeRunStatus(status) ? status : "not_run",
    lastRunAt: asString(value.lastRunAt),
    responseBytes: asNumber(value.responseBytes),
    articlesCount: asNumber(value.articlesCount),
    selectedLinksCount: asNumber(value.selectedLinksCount),
    failuresCount: asNumber(value.failuresCount),
    usedShell: asBoolean(value.usedShell),
    readToolResultFiles: asBoolean(value.readToolResultFiles),
    notes: asString(value.notes)
  });
}

function asJsonObject(value: JsonValue | undefined): JsonObject {
  return isJsonObject(value) ? value : {};
}

function asString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: JsonValue | undefined): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function omitUndefined(input: Record<string, JsonValue | undefined>): JsonObject {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as JsonObject;
}
