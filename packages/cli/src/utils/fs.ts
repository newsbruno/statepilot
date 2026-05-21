import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function readTextIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function writeTextFile(path: string, contents: string): Promise<WriteResult> {
  const previous = await readTextIfExists(path);
  if (previous === contents) {
    return { path, status: "unchanged" };
  }

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf8");
  return { path, status: previous === null ? "created" : "updated" };
}

export async function writeJsonFile(path: string, value: unknown): Promise<WriteResult> {
  return writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export interface WriteResult {
  readonly path: string;
  readonly status: "created" | "updated" | "unchanged";
}

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === "object" && "code" in error);
}
