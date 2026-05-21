import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installStatePilot } from "../installer/install";
import { getAgentConfigStatuses } from "./agent-config";

describe("agent config doctor", () => {
  it("reports local agent configs installed by StatePilot", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "statepilot-doctor-project-"));
    const homeDir = await mkdtemp(join(tmpdir(), "statepilot-doctor-home-"));

    await installStatePilot({
      target: "all",
      location: "local",
      projectRoot,
      homeDir,
      command: "statepilot"
    });

    const statuses = await getAgentConfigStatuses({
      target: "all",
      location: "local",
      projectRoot,
      homeDir
    });

    expect(statuses).toHaveLength(4);
    expect(statuses.map((status) => status.status)).toEqual(["configured", "configured", "configured", "configured"]);
    expect(statuses.map((status) => status.target)).toEqual(["claude", "cursor", "codex", "opencode"]);
  });

  it("reports missing configs with fix commands", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "statepilot-doctor-missing-project-"));
    const homeDir = await mkdtemp(join(tmpdir(), "statepilot-doctor-missing-home-"));

    const statuses = await getAgentConfigStatuses({
      target: "claude",
      location: "local",
      projectRoot,
      homeDir
    });

    expect(statuses).toHaveLength(1);
    expect(statuses[0]?.status).toBe("missing");
    expect(statuses[0]?.fixCommand).toBe("statepilot init . --install --target=claude");
  });

  it("reports invalid configs", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "statepilot-doctor-invalid-project-"));
    const homeDir = await mkdtemp(join(tmpdir(), "statepilot-doctor-invalid-home-"));
    await writeFile(join(projectRoot, ".claude.json"), JSON.stringify({ mcpServers: { statepilot: { command: "statepilot", args: [] } } }));

    const statuses = await getAgentConfigStatuses({
      target: "claude",
      location: "local",
      projectRoot,
      homeDir
    });

    expect(statuses[0]?.status).toBe("invalid");
    expect(statuses[0]?.message).toContain("serve --mcp");
  });
});
