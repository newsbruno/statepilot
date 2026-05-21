import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getSmokeMatrix, recordSmokeResult, resolveSmokeMatrixPath } from "./smoke-matrix";

describe("smoke matrix", () => {
  it("returns a default matrix when no file exists", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "statepilot-smoke-matrix-"));
    const matrix = await getSmokeMatrix({ projectRoot });

    expect(matrix.schemaVersion).toBe(1);
    expect(matrix.promptVersion).toBe("research-site-smoke-v4");
    expect(JSON.stringify(matrix)).toContain("\"claude\"");
    expect(JSON.stringify(matrix)).toContain("\"status\":\"not_run\"");
  });

  it("records a real-agent smoke result", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "statepilot-smoke-record-"));
    const result = await recordSmokeResult({
      projectRoot,
      target: "claude",
      status: "pass",
      responseBytes: 24_000,
      articlesCount: 5,
      selectedLinksCount: 5,
      failuresCount: 0,
      usedShell: false,
      readToolResultFiles: false,
      notes: "Claude returned JSON inline."
    });

    const serialized = JSON.stringify(result.matrix);

    expect(result.write.status).toBe("created");
    expect(serialized).toContain("\"claude\"");
    expect(serialized).toContain("\"status\":\"pass\"");
    expect(serialized).toContain("\"responseBytes\":24000");
    expect(serialized).toContain("Claude returned JSON inline.");
  });

  it("resolves the default matrix path under .statepilot", () => {
    expect(resolveSmokeMatrixPath({ projectRoot: "/tmp/example" })).toBe("/tmp/example/.statepilot/smoke-matrix.json");
  });
});
