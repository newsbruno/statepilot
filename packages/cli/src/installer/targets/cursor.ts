import { join } from "node:path";
import { createAgentInstructions, createCursorRule } from "../../agent/instructions";
import { updateJsonObjectFile } from "../../utils/json";
import { createMcpServerJson } from "../server-config";
import { upsertManagedInstructions } from "../managed-block";
import type { AgentTarget, InstallContext, InstallResult } from "../types";

export const cursorTarget: AgentTarget = {
  id: "cursor",
  label: "Cursor",
  async install(context: InstallContext): Promise<InstallResult> {
    const base = context.location === "global" ? context.homeDir : context.projectRoot;
    const configPath = join(base, ".cursor", "mcp.json");
    const rulePath = join(base, ".cursor", "rules", "statepilot.mdc");

    const writes = [
      await updateJsonObjectFile(configPath, (current) => ({
        ...current,
        mcpServers: {
          ...(current.mcpServers && typeof current.mcpServers === "object" && !Array.isArray(current.mcpServers)
            ? current.mcpServers
            : {}),
          statepilot: createMcpServerJson(context.command, context.args)
        }
      })),
      await upsertManagedInstructions(rulePath, context.location === "local" ? createCursorRule() : createAgentInstructions())
    ];

    return { target: "cursor", label: "Cursor", writes };
  },
  printConfig(context: InstallContext): string {
    return JSON.stringify({ mcpServers: { statepilot: createMcpServerJson(context.command, context.args) } }, null, 2);
  }
};
