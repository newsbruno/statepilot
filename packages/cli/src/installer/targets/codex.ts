import { join } from "node:path";
import { createAgentInstructions } from "../../agent/instructions";
import { updateCodexMcpToml } from "../../utils/toml";
import { upsertManagedInstructions } from "../managed-block";
import type { AgentTarget, InstallContext, InstallResult } from "../types";

export const codexTarget: AgentTarget = {
  id: "codex",
  label: "Codex CLI",
  async install(context: InstallContext): Promise<InstallResult> {
    const configPath =
      context.location === "global" ? join(context.homeDir, ".codex", "config.toml") : join(context.projectRoot, ".codex", "config.toml");
    const instructionsPath = context.location === "global" ? join(context.homeDir, ".codex", "AGENTS.md") : join(context.projectRoot, "AGENTS.md");

    const writes = [
      await updateCodexMcpToml(configPath, "statepilot", {
        command: context.command,
        args: context.args
      }),
      await upsertManagedInstructions(instructionsPath, createAgentInstructions())
    ];

    return { target: "codex", label: "Codex CLI", writes };
  },
  printConfig(context: InstallContext): string {
    return `[mcp_servers.statepilot]\ncommand = ${JSON.stringify(context.command)}\nargs = [${context.args.map((arg) => JSON.stringify(arg)).join(", ")}]\n`;
  }
};
