import { readTextIfExists, writeTextFile, type WriteResult } from "./fs";

export interface TomlMcpServer {
  readonly command: string;
  readonly args: readonly string[];
}

export async function updateCodexMcpToml(
  path: string,
  name: string,
  server: TomlMcpServer
): Promise<WriteResult> {
  const current = (await readTextIfExists(path)) ?? "";
  const block = renderMcpServerBlock(name, server);
  const pattern = new RegExp(`(?:^|\\n)\\[mcp_servers\\.${escapeRegExp(name)}\\][\\s\\S]*?(?=\\n\\[|$)`);
  const next = pattern.test(current)
    ? current.replace(pattern, `\n${block}`.trimEnd())
    : `${current.trimEnd()}${current.trim() ? "\n\n" : ""}${block}`;

  return writeTextFile(path, `${next.trimEnd()}\n`);
}

export function renderMcpServerBlock(name: string, server: TomlMcpServer): string {
  return [
    `[mcp_servers.${name}]`,
    `command = ${quoteToml(server.command)}`,
    `args = [${server.args.map(quoteToml).join(", ")}]`
  ].join("\n");
}

function quoteToml(value: string): string {
  return JSON.stringify(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
