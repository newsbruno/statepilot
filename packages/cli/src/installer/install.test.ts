import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installStatePilot, printTargetConfig, resolveServerCommand } from "./install";

describe("installStatePilot", () => {
  it("writes local agent configs for all supported targets", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "statepilot-install-"));
    const homeDir = await mkdtemp(join(tmpdir(), "statepilot-home-"));

    const results = await installStatePilot({
      target: "all",
      location: "local",
      projectRoot,
      homeDir,
      command: "statepilot"
    });

    expect(results.map((result) => result.target)).toEqual(["claude", "cursor", "codex", "opencode"]);
    await expect(readFile(join(projectRoot, ".cursor", "mcp.json"), "utf8")).resolves.toContain("statepilot");
    await expect(readFile(join(projectRoot, ".codex", "config.toml"), "utf8")).resolves.toContain("[mcp_servers.statepilot]");
    await expect(readFile(join(projectRoot, ".opencode", "opencode.jsonc"), "utf8")).resolves.toContain("\"mcp\"");
    await expect(readFile(join(projectRoot, "CLAUDE.md"), "utf8")).resolves.toContain("StatePilot");
    await expect(readFile(join(projectRoot, "AGENTS.md"), "utf8")).resolves.toContain("StatePilot");
  });

  it("can print Codex config without writing files", () => {
    expect(
      printTargetConfig({
        target: "codex",
        printConfig: "codex",
        location: "global",
        command: "statepilot"
      })
    ).toContain("[mcp_servers.statepilot]");
  });

  it("supports local node-based server commands for unpublished development", () => {
    expect(resolveServerCommand({ serverCommand: "node /tmp/statepilot.js" })).toEqual({
      command: "node",
      args: ["/tmp/statepilot.js", "serve", "--mcp"]
    });
  });
});
