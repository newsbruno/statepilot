import { join } from "node:path";
import { createAgentInstructions } from "../../agent/instructions";
import { updateJsonObjectFile } from "../../utils/json";
import { createOpenCodeServerJson } from "../server-config";
import { upsertManagedInstructions } from "../managed-block";
import type { AgentTarget, InstallContext, InstallResult } from "../types";

export const opencodeTarget: AgentTarget = {
  id: "opencode",
  label: "opencode",
  async install(context: InstallContext): Promise<InstallResult> {
    const base = context.location === "global" ? join(context.homeDir, ".config", "opencode") : join(context.projectRoot, ".opencode");
    const configPath = join(base, "opencode.jsonc");
    const instructionsPath = join(base, "AGENTS.md");

    const writes = [
      await updateJsonObjectFile(configPath, (current) => ({
        $schema: typeof current.$schema === "string" ? current.$schema : "https://opencode.ai/config.json",
        ...current,
        mcp: {
          ...(current.mcp && typeof current.mcp === "object" && !Array.isArray(current.mcp) ? current.mcp : {}),
          statepilot: createOpenCodeServerJson(context.command, context.args)
        }
      })),
      await upsertManagedInstructions(instructionsPath, createAgentInstructions())
    ];

    return { target: "opencode", label: "opencode", writes };
  },
  printConfig(context: InstallContext): string {
    return JSON.stringify(
      {
        $schema: "https://opencode.ai/config.json",
        mcp: {
          statepilot: createOpenCodeServerJson(context.command, context.args)
        }
      },
      null,
      2
    );
  }
};
