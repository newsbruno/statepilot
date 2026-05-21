import { readTextIfExists, writeTextFile, type WriteResult } from "../utils/fs";

const START = "<!-- statepilot:start -->";
const END = "<!-- statepilot:end -->";

export async function upsertManagedInstructions(path: string, markdown: string): Promise<WriteResult> {
  const current = (await readTextIfExists(path)) ?? "";
  const block = `${START}\n${markdown.trim()}\n${END}`;
  const pattern = new RegExp(`${escapeRegExp(START)}[\\s\\S]*?${escapeRegExp(END)}`);
  const next = pattern.test(current)
    ? current.replace(pattern, block)
    : `${current.trimEnd()}${current.trim() ? "\n\n" : ""}${block}\n`;

  return writeTextFile(path, next.endsWith("\n") ? next : `${next}\n`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
