import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium } from "playwright";

export interface BrowserStatus {
  readonly browser: "chromium";
  readonly installed: boolean;
  readonly executablePath: string;
  readonly installCommand: string;
}

export async function getChromiumStatus(): Promise<BrowserStatus> {
  const executablePath = chromium.executablePath();
  const installed = await fileExists(executablePath);

  return {
    browser: "chromium",
    installed,
    executablePath,
    installCommand: "statepilot browsers install"
  };
}

export async function installChromium(): Promise<void> {
  const playwrightCli = resolvePlaywrightCli();
  await runProcess(process.execPath, [playwrightCli, "install", "chromium"]);
}

export function isMissingPlaywrightBrowserError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Executable doesn't exist") && message.includes("playwright install");
}

export function isBrowserLaunchPermissionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Permission denied") &&
    (message.includes("MachPortRendezvous") || message.includes("bootstrap_check_in") || message.includes("kill EPERM"))
  );
}

export function createMissingBrowserMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return [
    "StatePilot needs the Playwright Chromium browser before it can run a real browser task.",
    "",
    "Run:",
    "",
    "  statepilot doctor --fix",
    "",
    "Original Playwright error:",
    message
  ].join("\n");
}

export function createBrowserLaunchPermissionMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return [
    "StatePilot installed Chromium, but this environment blocked Chromium from launching.",
    "",
    "This commonly happens inside sandboxed desktop/agent sessions on macOS.",
    "",
    "Run the same command from a normal terminal, or allow the agent/session to launch browser processes.",
    "",
    "Quick check:",
    "",
    "  statepilot doctor",
    "",
    "Original browser launch summary:",
    summarizeError(message)
  ].join("\n");
}

function summarizeError(message: string): string {
  return message
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed.includes("browserType.launch") ||
        trimmed.includes("Permission denied") ||
        trimmed.includes("MachPortRendezvous") ||
        trimmed.includes("Executable doesn't exist")
      );
    })
    .slice(0, 6)
    .join("\n");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function resolvePlaywrightCli(): string {
  const candidates = [
    join(process.cwd(), "node_modules", "playwright", "cli.js"),
    join(process.cwd(), "node_modules", ".pnpm", "playwright@1.60.0", "node_modules", "playwright", "cli.js")
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return createRequire(`${process.cwd()}/statepilot-cli.js`).resolve("playwright/cli");
}

async function runProcess(command: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`));
      }
    });
  });
}
