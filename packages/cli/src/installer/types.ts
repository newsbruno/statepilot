import type { WriteResult } from "../utils/fs";

export type AgentTargetId = "claude" | "cursor" | "codex" | "opencode";
export type InstallLocation = "global" | "local";

export interface InstallContext {
  readonly location: InstallLocation;
  readonly projectRoot: string;
  readonly homeDir: string;
  readonly command: string;
  readonly args: readonly string[];
}

export interface InstallResult {
  readonly target: AgentTargetId;
  readonly label: string;
  readonly writes: readonly WriteResult[];
}

export interface AgentTarget {
  readonly id: AgentTargetId;
  readonly label: string;
  install(context: InstallContext): Promise<InstallResult>;
  printConfig(context: InstallContext): string;
}
