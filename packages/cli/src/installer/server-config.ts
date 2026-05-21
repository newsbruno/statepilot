import type { JsonObject } from "../utils/json";

export function createMcpServerJson(command: string, args: readonly string[]): JsonObject {
  return {
    type: "stdio",
    command,
    args
  };
}

export function createOpenCodeServerJson(command: string, args: readonly string[]): JsonObject {
  return {
    type: "local",
    command: [command, ...args],
    enabled: true
  };
}
