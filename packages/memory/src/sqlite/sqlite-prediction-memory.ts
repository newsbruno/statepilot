import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type * as NodeSqlite from "node:sqlite";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";
import { parseAgentAction } from "@statepilot/action-model";
import type {
  AgentTaskError,
  FindTransitionInput,
  LearnedTransition,
  SaveTransitionInput,
  TransitionMetrics
} from "../models/learned-transition";
import type { PredictionMemory } from "../prediction-memory";

export interface SqlitePredictionMemoryConfig {
  readonly path: string;
}

interface TransitionRow {
  readonly id: string;
  readonly site_key: string | null;
  readonly goal_hash: string | null;
  readonly from_state_hash: string;
  readonly action_json: string;
  readonly to_state_hash: string;
  readonly success_count: number;
  readonly failure_count: number;
  readonly success_rate: number;
  readonly avg_latency_ms: number;
  readonly last_seen_at: string;
  readonly created_at: string;
}

export class SqlitePredictionMemory implements PredictionMemory {
  private readonly db: NodeDatabaseSync;

  constructor(config: SqlitePredictionMemoryConfig) {
    const { DatabaseSync } = loadNodeSqlite();
    this.db = new DatabaseSync(config.path);
    this.db.exec(sqliteMemorySchema);
  }

  async findBestTransition(input: FindTransitionInput): Promise<LearnedTransition | null> {
    const row = this.db
      .prepare(
        `
        SELECT *
        FROM learned_transitions
        WHERE from_state_hash = ?
          AND success_rate >= ?
          AND (? IS NULL OR site_key = ?)
          AND (? IS NULL OR goal_hash = ?)
        ORDER BY success_rate DESC, success_count DESC, last_seen_at DESC
        LIMIT 1
      `
      )
      .get(
        input.fromStateHash,
        input.minimumSuccessRate ?? 0,
        input.siteKey ?? null,
        input.siteKey ?? null,
        input.goalHash ?? null,
        input.goalHash ?? null
      ) as unknown as TransitionRow | undefined;

    return row ? mapTransitionRow(row) : null;
  }

  async saveTransition(input: SaveTransitionInput): Promise<LearnedTransition> {
    const now = (input.observedAt ?? new Date()).toISOString();
    const actionJson = stableActionJson(input.action);
    const existing = this.db
      .prepare(
        `
        SELECT *
        FROM learned_transitions
        WHERE from_state_hash = ?
          AND to_state_hash = ?
          AND action_json = ?
          AND site_key IS ?
          AND goal_hash IS ?
        LIMIT 1
      `
      )
      .get(input.fromStateHash, input.toStateHash, actionJson, input.siteKey ?? null, input.goalHash ?? null) as
      | TransitionRow
      | undefined;

    if (existing) {
      await this.markSuccess(existing.id, { latencyMs: input.latencyMs ?? existing.avg_latency_ms });
      const updated = this.db.prepare("SELECT * FROM learned_transitions WHERE id = ?").get(existing.id) as unknown as TransitionRow;
      return mapTransitionRow(updated);
    }

    const id = input.id ?? randomUUID();
    this.db
      .prepare(
        `
        INSERT INTO learned_transitions (
          id,
          site_key,
          goal_hash,
          from_state_hash,
          action_json,
          to_state_hash,
          success_count,
          failure_count,
          success_rate,
          avg_latency_ms,
          last_seen_at,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 1, 0, 1, ?, ?, ?)
      `
      )
      .run(
        id,
        input.siteKey ?? null,
        input.goalHash ?? null,
        input.fromStateHash,
        actionJson,
        input.toStateHash,
        input.latencyMs ?? 0,
        now,
        now
      );

    const row = this.db.prepare("SELECT * FROM learned_transitions WHERE id = ?").get(id) as unknown as TransitionRow;
    return mapTransitionRow(row);
  }

  async markSuccess(id: string, metrics: TransitionMetrics): Promise<void> {
    const row = this.db.prepare("SELECT * FROM learned_transitions WHERE id = ?").get(id) as unknown as
      | TransitionRow
      | undefined;

    if (!row) {
      return;
    }

    const successCount = row.success_count + 1;
    const avgLatencyMs = (row.avg_latency_ms * row.success_count + metrics.latencyMs) / successCount;
    const successRate = successCount / (successCount + row.failure_count);

    this.db
      .prepare(
        `
        UPDATE learned_transitions
        SET success_count = ?, success_rate = ?, avg_latency_ms = ?, last_seen_at = ?
        WHERE id = ?
      `
      )
      .run(successCount, successRate, avgLatencyMs, new Date().toISOString(), id);
  }

  async markFailure(id: string, _error: AgentTaskError): Promise<void> {
    const row = this.db.prepare("SELECT * FROM learned_transitions WHERE id = ?").get(id) as unknown as
      | TransitionRow
      | undefined;

    if (!row) {
      return;
    }

    const failureCount = row.failure_count + 1;
    const successRate = row.success_count / (row.success_count + failureCount);

    this.db
      .prepare(
        `
        UPDATE learned_transitions
        SET failure_count = ?, success_rate = ?, last_seen_at = ?
        WHERE id = ?
      `
      )
      .run(failureCount, successRate, new Date().toISOString(), id);
  }

  close(): void {
    this.db.close();
  }
}

export function createSqlitePredictionMemory(config: SqlitePredictionMemoryConfig): SqlitePredictionMemory {
  return new SqlitePredictionMemory(config);
}

export const sqliteMemorySchema = `
CREATE TABLE IF NOT EXISTS learned_transitions (
  id TEXT PRIMARY KEY,
  site_key TEXT,
  goal_hash TEXT,
  from_state_hash TEXT NOT NULL,
  action_json TEXT NOT NULL,
  to_state_hash TEXT NOT NULL,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  success_rate REAL NOT NULL DEFAULT 0,
  avg_latency_ms REAL NOT NULL DEFAULT 0,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS learned_transitions_lookup_idx
  ON learned_transitions (from_state_hash, site_key, goal_hash, success_rate);
`;

function mapTransitionRow(row: TransitionRow): LearnedTransition {
  return {
    id: row.id,
    siteKey: row.site_key ?? undefined,
    goalHash: row.goal_hash ?? undefined,
    fromStateHash: row.from_state_hash,
    action: parseAgentAction(JSON.parse(row.action_json)),
    toStateHash: row.to_state_hash,
    successCount: row.success_count,
    failureCount: row.failure_count,
    successRate: row.success_rate,
    avgLatencyMs: row.avg_latency_ms,
    lastSeenAt: new Date(row.last_seen_at),
    createdAt: new Date(row.created_at)
  };
}

function stableActionJson(input: unknown): string {
  if (input === null || typeof input !== "object") {
    return JSON.stringify(input) ?? "undefined";
  }

  if (Array.isArray(input)) {
    return `[${input.map((item) => stableActionJson(item)).join(",")}]`;
  }

  const record = input as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableActionJson(record[key])}`)
    .join(",")}}`;
}

function loadNodeSqlite(): typeof NodeSqlite {
  const require = createRequire(`${process.cwd()}/statepilot-memory.js`);
  return require("node:sqlite") as typeof NodeSqlite;
}
