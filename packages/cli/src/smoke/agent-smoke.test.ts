import { describe, expect, it } from "vitest";
import { createAgentSmokePrompt, runAgentSmokeSuite } from "./agent-smoke";

describe("agent smoke suite", () => {
  it("runs the compact research smoke test with the mock adapter", async () => {
    const result = await runAgentSmokeSuite({
      target: "claude",
      limit: 1,
      useMock: true,
      maxResponseBytes: 20_000
    });

    expect(result.status).toBe("pass");
    expect(result.mode).toBe("mock");
    expect(JSON.stringify(result)).toContain("\"responseMode\":\"compact\"");
    expect(JSON.stringify(result)).toContain("\"smokeMode\":true");
    expect(JSON.stringify(result)).toContain("\"tool\":\"statepilot_research_site\"");
    expect(JSON.stringify(result)).not.toContain("\"article\":{");
    expect(JSON.stringify(result)).not.toContain("\"claims\":[");
  });

  it("creates real-agent prompts that forbid shell workarounds", () => {
    const prompt = createAgentSmokePrompt("codex", { limit: 2 });

    expect(prompt).toContain("StatePilot real-agent smoke test for Codex CLI");
    expect(prompt).toContain("statepilot_research_site");
    expect(prompt).toContain("\"limit\": 2");
    expect(prompt).toContain("\"smokeMode\": true");
    expect(prompt).toContain("does not read tool-result files");
    expect(prompt).toContain("does not run shell");
  });
});
