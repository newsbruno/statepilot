import { homedir } from "node:os";
import { resolve } from "node:path";
import { AGENT_TARGETS, getAgentTarget } from "./targets/registry";
import type { AgentTargetId, InstallContext, InstallLocation, InstallResult } from "./types";

export interface InstallOptions {
  readonly target: string;
  readonly location: InstallLocation;
  readonly projectRoot?: string;
  readonly homeDir?: string;
  readonly command?: string;
  readonly args?: readonly string[];
  readonly serverCommand?: string;
}

export async function installStatePilot(options: InstallOptions): Promise<readonly InstallResult[]> {
  const serverCommand = resolveServerCommand(options);
  const context: InstallContext = {
    location: options.location,
    projectRoot: resolve(options.projectRoot ?? process.cwd()),
    homeDir: options.homeDir ?? homedir(),
    command: serverCommand.command,
    args: serverCommand.args
  };

  const targets = resolveTargets(options.target).map(getAgentTarget);
  const results: InstallResult[] = [];

  for (const target of targets) {
    results.push(await target.install(context));
  }

  return results;
}

export function printTargetConfig(options: InstallOptions & { readonly printConfig: AgentTargetId }): string {
  const serverCommand = resolveServerCommand(options);
  const context: InstallContext = {
    location: options.location,
    projectRoot: resolve(options.projectRoot ?? process.cwd()),
    homeDir: options.homeDir ?? homedir(),
    command: serverCommand.command,
    args: serverCommand.args
  };

  return getAgentTarget(options.printConfig).printConfig(context);
}

export function resolveTargets(value: string): readonly AgentTargetId[] {
  if (value === "all" || value === "auto") {
    return AGENT_TARGETS.map((target) => target.id);
  }

  const ids = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    return ["claude", "cursor", "codex", "opencode"];
  }

  for (const id of ids) {
    if (!isAgentTargetId(id)) {
      throw new Error(`Unsupported target "${id}". Use claude,cursor,codex,opencode,all,auto.`);
    }
  }

  return ids as readonly AgentTargetId[];
}

export function isInstallLocation(value: string): value is InstallLocation {
  return value === "global" || value === "local";
}

function isAgentTargetId(value: string): value is AgentTargetId {
  return ["claude", "cursor", "codex", "opencode"].includes(value);
}

export interface ServerCommand {
  readonly command: string;
  readonly args: readonly string[];
}

export function resolveServerCommand(options: Pick<InstallOptions, "command" | "args" | "serverCommand">): ServerCommand {
  if (options.serverCommand) {
    const parts = splitCommandLine(options.serverCommand);
    const [command, ...args] = parts;
    if (!command) {
      throw new Error("--server-command must include a command");
    }

    return {
      command,
      args: [...args, "serve", "--mcp"]
    };
  }

  return {
    command: options.command ?? "statepilot",
    args: options.args ?? ["serve", "--mcp"]
  };
}

export function splitCommandLine(value: string): readonly string[] {
  const parts: string[] = [];
  let current = "";
  let quote: "\"" | "'" | null = null;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (!char) {
      continue;
    }

    if ((char === "\"" || char === "'") && quote === null) {
      quote = char;
      continue;
    }

    if (char === quote) {
      quote = null;
      continue;
    }

    if (/\s/.test(char) && quote === null) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (quote) {
    throw new Error(`Unclosed quote in command: ${value}`);
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}
