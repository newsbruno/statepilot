import { join } from "node:path";
import { createAgentInstructions, STATEPILOT_TOOL_NAMES } from "../../agent/instructions";
import { updateJsonObjectFile, type JsonObject } from "../../utils/json";
import { createMcpServerJson } from "../server-config";
import { upsertManagedInstructions } from "../managed-block";
import type { AgentTarget, InstallContext, InstallResult } from "../types";

export const claudeTarget: AgentTarget = {
  id: "claude",
  label: "Claude Code",
  async install(context: InstallContext): Promise<InstallResult> {
    const configPath = context.location === "global" ? join(context.homeDir, ".claude.json") : join(context.projectRoot, ".claude.json");
    const instructionsPath =
      context.location === "global" ? join(context.homeDir, ".claude", "CLAUDE.md") : join(context.projectRoot, "CLAUDE.md");
    const settingsPath =
      context.location === "global"
        ? join(context.homeDir, ".claude", "settings.json")
        : join(context.projectRoot, ".claude", "settings.json");

    const writes = [
      await updateJsonObjectFile(configPath, (current) => ({
        ...current,
        mcpServers: {
          ...asObject(current.mcpServers),
          statepilot: createMcpServerJson(context.command, context.args)
        }
      })),
      await updateJsonObjectFile(settingsPath, (current) => ({
        ...current,
        permissions: updatePermissions(asObject(current.permissions))
      })),
      await upsertManagedInstructions(instructionsPath, createAgentInstructions())
    ];

    return { target: "claude", label: "Claude Code", writes };
  },
  printConfig(context: InstallContext): string {
    return JSON.stringify({ mcpServers: { statepilot: createMcpServerJson(context.command, context.args) } }, null, 2);
  }
};

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function mergeStringList(existing: readonly unknown[], next: readonly string[]): string[] {
  return Array.from(new Set([...existing.filter((value): value is string => typeof value === "string"), ...next]));
}

function updatePermissions(permissions: JsonObject): JsonObject {
  const allow = permissions.allow;

  return {
    ...permissions,
    allow: mergeStringList(
      Array.isArray(allow) ? allow : [],
      STATEPILOT_TOOL_NAMES.map((name) => `mcp__statepilot__${name}`)
    )
  };
}
