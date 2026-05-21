import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { resolveTargets } from "../installer/install";
import type { AgentTargetId, InstallLocation } from "../installer/types";
import { isJsonObject, stripJsonComments, type JsonObject } from "../utils/json";
import { readTextIfExists } from "../utils/fs";

export type DoctorLocation = InstallLocation | "all";
export type AgentConfigStatusKind = "configured" | "missing" | "invalid";

export interface AgentConfigStatus {
  readonly target: AgentTargetId;
  readonly label: string;
  readonly location: InstallLocation;
  readonly status: AgentConfigStatusKind;
  readonly configPath: string;
  readonly instructionsPath: string;
  readonly message: string;
  readonly fixCommand: string;
}

export interface AgentConfigDoctorOptions {
  readonly target?: string;
  readonly location?: DoctorLocation;
  readonly projectRoot?: string;
  readonly homeDir?: string;
}

interface TargetPaths {
  readonly configPath: string;
  readonly instructionsPath: string;
}

const TARGET_LABELS: Record<AgentTargetId, string> = {
  claude: "Claude Code",
  cursor: "Cursor",
  codex: "Codex CLI",
  opencode: "opencode"
};

export function isDoctorLocation(value: string): value is DoctorLocation {
  return value === "local" || value === "global" || value === "all";
}

export async function getAgentConfigStatuses(options: AgentConfigDoctorOptions = {}): Promise<readonly AgentConfigStatus[]> {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const home = options.homeDir ?? homedir();
  const targetIds = resolveTargets(options.target ?? "all");
  const locations = resolveDoctorLocations(options.location ?? "local");
  const statuses: AgentConfigStatus[] = [];

  for (const location of locations) {
    for (const target of targetIds) {
      statuses.push(await readTargetStatus(target, location, projectRoot, home));
    }
  }

  return statuses;
}

function resolveDoctorLocations(location: DoctorLocation): readonly InstallLocation[] {
  return location === "all" ? ["local", "global"] : [location];
}

async function readTargetStatus(
  target: AgentTargetId,
  location: InstallLocation,
  projectRoot: string,
  homeDir: string
): Promise<AgentConfigStatus> {
  const paths = resolveTargetPaths(target, location, projectRoot, homeDir);
  const text = await readTextIfExists(paths.configPath);
  const base = {
    target,
    label: TARGET_LABELS[target],
    location,
    configPath: paths.configPath,
    instructionsPath: paths.instructionsPath,
    fixCommand: createFixCommand(target, location)
  };

  if (text === null) {
    return {
      ...base,
      status: "missing",
      message: "config file not found"
    };
  }

  const validation = validateTargetConfig(target, text);
  return {
    ...base,
    status: validation.status,
    message: validation.message
  };
}

function resolveTargetPaths(target: AgentTargetId, location: InstallLocation, projectRoot: string, homeDir: string): TargetPaths {
  switch (target) {
    case "claude":
      return {
        configPath: location === "global" ? join(homeDir, ".claude.json") : join(projectRoot, ".claude.json"),
        instructionsPath: location === "global" ? join(homeDir, ".claude", "CLAUDE.md") : join(projectRoot, "CLAUDE.md")
      };
    case "cursor": {
      const base = location === "global" ? homeDir : projectRoot;
      return {
        configPath: join(base, ".cursor", "mcp.json"),
        instructionsPath: join(base, ".cursor", "rules", "statepilot.mdc")
      };
    }
    case "codex":
      return {
        configPath:
          location === "global" ? join(homeDir, ".codex", "config.toml") : join(projectRoot, ".codex", "config.toml"),
        instructionsPath: location === "global" ? join(homeDir, ".codex", "AGENTS.md") : join(projectRoot, "AGENTS.md")
      };
    case "opencode": {
      const base = location === "global" ? join(homeDir, ".config", "opencode") : join(projectRoot, ".opencode");
      return {
        configPath: join(base, "opencode.jsonc"),
        instructionsPath: join(base, "AGENTS.md")
      };
    }
  }
}

function createFixCommand(target: AgentTargetId, location: InstallLocation): string {
  return location === "local"
    ? `statepilot init . --install --target=${target}`
    : `statepilot install --target=${target} --location=global`;
}

function validateTargetConfig(target: AgentTargetId, text: string): Pick<AgentConfigStatus, "status" | "message"> {
  if (target === "codex") {
    return validateCodexConfig(text);
  }

  const parsed = parseJsonObject(text);
  if (!parsed.ok) {
    return {
      status: "invalid",
      message: parsed.message
    };
  }

  if (target === "opencode") {
    return validateOpenCodeConfig(parsed.value);
  }

  return validateMcpServersConfig(parsed.value);
}

function validateMcpServersConfig(config: JsonObject): Pick<AgentConfigStatus, "status" | "message"> {
  const mcpServers = config.mcpServers;
  if (!isJsonObject(mcpServers) || !isJsonObject(mcpServers.statepilot)) {
    return {
      status: "missing",
      message: "mcpServers.statepilot not found"
    };
  }

  return validateCommandAndArgs(mcpServers.statepilot);
}

function validateOpenCodeConfig(config: JsonObject): Pick<AgentConfigStatus, "status" | "message"> {
  const mcp = config.mcp;
  if (!isJsonObject(mcp) || !isJsonObject(mcp.statepilot)) {
    return {
      status: "missing",
      message: "mcp.statepilot not found"
    };
  }

  const command = mcp.statepilot.command;
  if (!Array.isArray(command) || command.length === 0 || !command.every((part): part is string => typeof part === "string")) {
    return {
      status: "invalid",
      message: "mcp.statepilot.command must be a command array"
    };
  }

  return validateCommandParts(command);
}

function validateCodexConfig(text: string): Pick<AgentConfigStatus, "status" | "message"> {
  const block = text.match(/(?:^|\n)\[mcp_servers\.statepilot\]([\s\S]*?)(?=\n\[|$)/);
  if (!block?.[1]) {
    return {
      status: "missing",
      message: "[mcp_servers.statepilot] not found"
    };
  }

  const command = parseTomlString(block[1], "command");
  const args = parseTomlStringArray(block[1], "args");
  if (!command || !args) {
    return {
      status: "invalid",
      message: "[mcp_servers.statepilot] must include command and args"
    };
  }

  return validateCommandParts([command, ...args]);
}

function validateCommandAndArgs(server: JsonObject): Pick<AgentConfigStatus, "status" | "message"> {
  const command = server.command;
  const args = server.args;
  if (typeof command !== "string" || !Array.isArray(args) || !args.every((arg): arg is string => typeof arg === "string")) {
    return {
      status: "invalid",
      message: "statepilot MCP server must include string command and string[] args"
    };
  }

  return validateCommandParts([command, ...args]);
}

function validateCommandParts(parts: readonly string[]): Pick<AgentConfigStatus, "status" | "message"> {
  if (parts.includes("serve") && parts.includes("--mcp")) {
    return {
      status: "configured",
      message: `runs ${parts.join(" ")}`
    };
  }

  return {
    status: "invalid",
    message: "statepilot MCP server must run `serve --mcp`"
  };
}

function parseJsonObject(text: string): { readonly ok: true; readonly value: JsonObject } | { readonly ok: false; readonly message: string } {
  try {
    const parsed = JSON.parse(stripJsonComments(text)) as unknown;
    if (!isJsonObject(parsed)) {
      return {
        ok: false,
        message: "config must contain a JSON object"
      };
    }

    return {
      ok: true,
      value: parsed
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

function parseTomlString(block: string, key: string): string | undefined {
  const match = block.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(".*")\\s*$`, "m"));
  if (!match?.[1]) {
    return undefined;
  }

  try {
    const value = JSON.parse(match[1]) as unknown;
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

function parseTomlStringArray(block: string, key: string): readonly string[] | undefined {
  const match = block.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*(\\[.*\\])\\s*$`, "m"));
  if (!match?.[1]) {
    return undefined;
  }

  try {
    const value = JSON.parse(match[1]) as unknown;
    return Array.isArray(value) && value.every((item): item is string => typeof item === "string") ? value : undefined;
  } catch {
    return undefined;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
