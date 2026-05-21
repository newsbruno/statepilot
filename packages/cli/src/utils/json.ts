import { readTextIfExists, writeJsonFile, type WriteResult } from "./fs";

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type JsonValue = string | number | boolean | null | JsonObject | readonly JsonValue[];

export async function updateJsonObjectFile(
  path: string,
  updater: (current: JsonObject) => JsonObject
): Promise<WriteResult> {
  const current = await readJsonObject(path);
  return writeJsonFile(path, updater(current));
}

export async function readJsonObject(path: string): Promise<JsonObject> {
  const contents = await readTextIfExists(path);
  if (!contents) {
    return {};
  }

  const parsed = JSON.parse(stripJsonComments(contents)) as unknown;
  if (!isJsonObject(parsed)) {
    throw new Error(`${path} must contain a JSON object`);
  }

  return parsed;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function stripJsonComments(value: string): string {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}
