import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getProjectStatus, initProject } from "./project-config";

describe("project config", () => {
  it("initializes a StatePilot project", async () => {
    const root = await mkdtemp(join(tmpdir(), "statepilot-project-"));

    const result = await initProject(root);
    const status = await getProjectStatus(root);

    expect(result.status).toBe("created");
    expect(status.initialized).toBe(true);
    expect(status.config?.version).toBe(1);
  });
});
