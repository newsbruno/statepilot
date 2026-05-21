import { getBooleanFlag, getStringFlag, parseArgs } from "./args";
import { installStatePilot, isInstallLocation, printTargetConfig } from "../installer/install";
import type { AgentTargetId, InstallLocation } from "../installer/types";
import { getProjectStatus, initProject } from "../project/project-config";
import { serveMcp } from "../mcp/server";
import { getChromiumStatus, installChromium } from "../browser/playwright-browsers";
import { getAgentConfigStatuses, isDoctorLocation } from "../doctor/agent-config";
import { createAgentSmokePrompts, isAgentSmokeTarget, runAgentSmokeSuite } from "../smoke/agent-smoke";
import { getSmokeMatrix, isSmokeRunStatus, recordSmokeResult } from "../smoke/smoke-matrix";

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(argv);

  switch (parsed.command) {
    case "install":
      await runInstall(parsed.flags);
      return;
    case "setup":
      await runSetup(parsed.flags);
      return;
    case "browsers":
      await runBrowsers(parsed.positionals);
      return;
    case "doctor":
      await runDoctor(parsed.flags);
      return;
    case "smoke":
      await runSmoke(parsed.positionals, parsed.flags);
      return;
    case "init":
      await runInit(parsed.positionals, parsed.flags);
      return;
    case "status":
      await runStatus(parsed.positionals);
      return;
    case "serve":
      if (!getBooleanFlag(parsed.flags, "mcp")) {
        throw new Error("Only `statepilot serve --mcp` is supported right now.");
      }
      await serveMcp();
      return;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return;
    default:
      throw new Error(`Unknown StatePilot command: ${parsed.command}`);
  }
}

async function runSmoke(positionals: readonly string[], flags: ReadonlyMap<string, string | boolean>): Promise<void> {
  const action = positionals[0] ?? "run";
  const targetFlag = getStringFlag(flags, "target") ?? "all";
  if ((action === "record" && !asAgentTargetIdOrUndefined(targetFlag)) || (action !== "record" && !isAgentSmokeTarget(targetFlag))) {
    throw new Error(`Unsupported smoke target "${targetFlag}". Use claude, cursor, codex, opencode, or all.`);
  }
  const smokeTarget = isAgentSmokeTarget(targetFlag) ? targetFlag : "all";

  const options = {
    target: smokeTarget,
    url: getStringFlag(flags, "url"),
    topic: getStringFlag(flags, "topic"),
    limit: getIntegerFlag(flags, "limit"),
    maxResponseBytes: getIntegerFlag(flags, "max-response-bytes"),
    useMock: !getBooleanFlag(flags, "real")
  };

  if (action === "prompt" || action === "prompts") {
    const prompts = createAgentSmokePrompts(options);
    for (const [target, prompt] of Object.entries(prompts)) {
      const promptText = typeof prompt === "string" ? prompt : JSON.stringify(prompt, null, 2);
      process.stdout.write(`## ${target}\n\n${promptText ?? ""}\n\n`);
    }
    return;
  }

  if (action === "matrix") {
    const matrix = await getSmokeMatrix({
      file: getStringFlag(flags, "file")
    });
    process.stdout.write(`${JSON.stringify(matrix, null, 2)}\n`);
    return;
  }

  if (action === "record") {
    const target = asAgentTargetIdOrUndefined(targetFlag);
    if (!target) {
      throw new Error("Usage: statepilot smoke record --target=claude|cursor|codex|opencode --status=pass|fail|blocked");
    }

    const recordStatus = asSmokeRecordStatus(getStringFlag(flags, "status"));
    if (!recordStatus) {
      throw new Error("Usage: statepilot smoke record --target=claude|cursor|codex|opencode --status=pass|fail|blocked");
    }

    const result = await recordSmokeResult({
      target,
      status: recordStatus,
      file: getStringFlag(flags, "file"),
      responseBytes: getIntegerFlag(flags, "response-bytes"),
      articlesCount: getIntegerFlag(flags, "articles"),
      selectedLinksCount: getIntegerFlag(flags, "selected-links"),
      failuresCount: getIntegerFlag(flags, "failures"),
      usedShell: getOptionalBooleanFlag(flags, "used-shell"),
      readToolResultFiles: getOptionalBooleanFlag(flags, "read-tool-results"),
      notes: getStringFlag(flags, "notes")
    });
    process.stdout.write(`${JSON.stringify({ write: result.write, matrix: result.matrix }, null, 2)}\n`);
    return;
  }

  if (action !== "run") {
    throw new Error("Usage: statepilot smoke [run|prompt|matrix|record] [--target=claude|cursor|codex|opencode|all] [--real]");
  }

  const result = await runAgentSmokeSuite(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "pass") {
    process.exitCode = 1;
  }
}

async function runSetup(flags: ReadonlyMap<string, string | boolean>): Promise<void> {
  process.stdout.write("Installing Playwright Chromium for StatePilot...\n");
  await installChromium();
  process.stdout.write("Configuring agent integration...\n");
  await runInstall(flags);
  process.stdout.write("StatePilot setup complete. Restart your agent to load the MCP server.\n");
}

async function runBrowsers(positionals: readonly string[]): Promise<void> {
  const action = positionals[0] ?? "status";
  if (action === "install") {
    await installChromium();
    process.stdout.write("Playwright Chromium installed for StatePilot.\n");
    return;
  }

  if (action !== "status") {
    throw new Error("Usage: statepilot browsers [status|install]");
  }

  const status = await getChromiumStatus();
  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
}

async function runDoctor(flags: ReadonlyMap<string, string | boolean>): Promise<void> {
  const fix = getBooleanFlag(flags, "fix");
  const target = getStringFlag(flags, "target") ?? "all";
  const location = getStringFlag(flags, "location") ?? "local";
  if (!isDoctorLocation(location)) {
    throw new Error("Usage: statepilot doctor [--fix] [--target=claude,cursor,codex,opencode|all] [--location=local|global|all]");
  }

  let status = await getChromiumStatus();
  process.stdout.write(`StatePilot doctor\n\n`);
  process.stdout.write(`Chromium: ${status.installed ? "installed" : "missing"}\n`);
  process.stdout.write(`Path: ${status.executablePath}\n`);
  if (!status.installed) {
    process.stdout.write(`Fix: statepilot doctor --fix\n`);
    if (fix) {
      process.stdout.write(`\nInstalling Playwright Chromium...\n`);
      await installChromium();
      status = await getChromiumStatus();
      process.stdout.write(`\nChromium: ${status.installed ? "installed" : "missing"}\n`);
      process.stdout.write(`Path: ${status.executablePath}\n`);
    }
  } else if (fix) {
    process.stdout.write(`\nNo fix needed. Chromium is already installed.\n`);
  }

  process.stdout.write(`\nAgent MCP configs (${location}):\n`);
  const agentStatuses = await getAgentConfigStatuses({ target, location });
  for (const agentStatus of agentStatuses) {
    process.stdout.write(`\n${agentStatus.label} [${agentStatus.location}]: ${agentStatus.status}\n`);
    process.stdout.write(`Config: ${agentStatus.configPath}\n`);
    process.stdout.write(`Details: ${agentStatus.message}\n`);
    if (agentStatus.status !== "configured") {
      process.stdout.write(`Fix: ${agentStatus.fixCommand}\n`);
    }
  }
}

async function runInstall(flags: ReadonlyMap<string, string | boolean>): Promise<void> {
  const printConfig = getStringFlag(flags, "print-config");
  const target = getStringFlag(flags, "target") ?? (printConfig ? printConfig : "all");
  const locationFlag = getStringFlag(flags, "location") ?? "global";
  const location: InstallLocation = isInstallLocation(locationFlag) ? locationFlag : "global";
  const command = getStringFlag(flags, "command") ?? "statepilot";

  if (printConfig) {
    process.stdout.write(
      `${printTargetConfig({
        target,
        printConfig: asAgentTargetId(printConfig),
        location,
        command
      })}\n`
    );
    return;
  }

  const results = await installStatePilot({
    target,
    location,
    command
  });

  for (const result of results) {
    process.stdout.write(`Installed ${result.label}\n`);
    for (const write of result.writes) {
      process.stdout.write(`  ${write.status}: ${write.path}\n`);
    }
  }
}

async function runInit(positionals: readonly string[], flags: ReadonlyMap<string, string | boolean>): Promise<void> {
  const root = positionals[0] ?? process.cwd();
  const result = await initProject(root);
  process.stdout.write(`${result.status}: ${result.path}\n`);

  if (getBooleanFlag(flags, "install") || getBooleanFlag(flags, "i")) {
    const results = await installStatePilot({
      target: getStringFlag(flags, "target") ?? "all",
      location: "local",
      projectRoot: root,
      command: getStringFlag(flags, "command") ?? "statepilot"
    });

    for (const installResult of results) {
      process.stdout.write(`Installed ${installResult.label}\n`);
    }
  }
}

async function runStatus(positionals: readonly string[]): Promise<void> {
  const status = await getProjectStatus(positionals[0] ?? process.cwd());
  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
}

function printHelp(): void {
  process.stdout.write(`StatePilot

Usage:
  statepilot setup [--target=claude,cursor,codex,opencode|all] [--location=global|local]
  statepilot install [--target=claude,cursor,codex,opencode|all] [--location=global|local]
  statepilot install --print-config codex
  statepilot init [path] --install
  statepilot browsers [status|install]
  statepilot doctor [--fix] [--target=claude,cursor,codex,opencode|all] [--location=local|global|all]
  statepilot smoke [run|prompt|matrix|record] [--target=claude,cursor,codex,opencode|all] [--real]
  statepilot status [path]
  statepilot serve --mcp

Examples:
  statepilot setup --target=codex
  statepilot install --target=all --location=global
  statepilot init . --install --target=cursor,codex
  statepilot browsers install
  statepilot doctor --location=all
  statepilot smoke run
  statepilot smoke prompt --target=claude
  statepilot smoke record --target=claude --status=pass --response-bytes=24000 --articles=5 --failures=0
  statepilot serve --mcp
`);
}

function asAgentTargetIdOrUndefined(value: string): AgentTargetId | undefined {
  return value === "claude" || value === "cursor" || value === "codex" || value === "opencode" ? value : undefined;
}

function asAgentTargetId(value: string): AgentTargetId {
  if (value === "claude" || value === "cursor" || value === "codex" || value === "opencode") {
    return value;
  }

  throw new Error(`Unsupported target "${value}" for --print-config`);
}

function getIntegerFlag(flags: ReadonlyMap<string, string | boolean>, key: string): number | undefined {
  const value = getStringFlag(flags, key);
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getOptionalBooleanFlag(flags: ReadonlyMap<string, string | boolean>, key: string): boolean | undefined {
  const value = flags.get(key);
  if (value === undefined) {
    return undefined;
  }

  return value === true || value === "true";
}

function asSmokeRecordStatus(value: string | undefined): "pass" | "fail" | "blocked" | undefined {
  return value && isSmokeRunStatus(value) && value !== "not_run" ? value : undefined;
}
