import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { readJsonObject, type JsonObject } from "../utils/json";
import { writeJsonFile, type WriteResult } from "../utils/fs";

export interface StatePilotProjectConfig {
  readonly version: 1;
  readonly runtime: {
    readonly memoryPath: string;
    readonly headless: boolean;
    readonly maxActions: number;
  };
  readonly agent: {
    readonly preferPredictiveRuntime: boolean;
    readonly llmFallback: boolean;
  };
}

export interface ProjectStatus {
  readonly root: string;
  readonly initialized: boolean;
  readonly configPath: string;
  readonly config?: JsonObject;
}

export function getProjectConfigPath(root = process.cwd()): string {
  return resolve(root, ".statepilot", "config.json");
}

export async function initProject(root = process.cwd()): Promise<WriteResult> {
  const configPath = getProjectConfigPath(root);
  await mkdir(resolve(root, ".statepilot"), { recursive: true });
  return writeJsonFile(configPath, createDefaultProjectConfig());
}

export async function getProjectStatus(root = process.cwd()): Promise<ProjectStatus> {
  const configPath = getProjectConfigPath(root);

  try {
    const config = await readJsonObject(configPath);
    return {
      root: resolve(root),
      initialized: true,
      configPath,
      config
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw error;
    }

    return {
      root: resolve(root),
      initialized: false,
      configPath
    };
  }
}

export function createDefaultProjectConfig(): StatePilotProjectConfig {
  return {
    version: 1,
    runtime: {
      memoryPath: ".statepilot/statepilot.db",
      headless: true,
      maxActions: 12
    },
    agent: {
      preferPredictiveRuntime: true,
      llmFallback: false
    }
  };
}
