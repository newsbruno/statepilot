import { describe, expect, it } from "vitest";
import { callStatePilotTool } from "./tools";

describe("StatePilot MCP tools", () => {
  it("returns agent instructions", async () => {
    const result = await callStatePilotTool("statepilot_agent_instructions", {});

    expect(JSON.stringify(result)).toContain("StatePilot");
  });

  it("runs a mock browser task", async () => {
    const result = await callStatePilotTool("statepilot_run_task", {
      goal: "Open page",
      input: { url: "https://example.com" },
      useMock: true,
      extractText: true,
      maxActions: 3
    });

    expect(JSON.stringify(result)).toContain("\"status\":\"success\"");
    expect(JSON.stringify(result)).toContain("Loaded https://example.com");
    expect(JSON.stringify(result)).toContain("https://example.com/2026/05/20/example-article/");
  });

  it("infers URL and text extraction from a natural-language agent goal", async () => {
    const result = await callStatePilotTool("statepilot_run_task", {
      goal: "Open https://techcrunch.com/ and extract page text",
      useMock: true,
      maxActions: 3
    });

    expect(JSON.stringify(result)).toContain("\"status\":\"success\"");
    expect(JSON.stringify(result)).toContain("Loaded https://techcrunch.com/");
  });

  it("returns article metadata and evidence when articleMode is enabled", async () => {
    const result = await callStatePilotTool("statepilot_run_task", {
      goal: "Open article and extract title, author, date, body, and evidence",
      input: { url: "https://example.com/2026/05/20/article/" },
      useMock: true,
      articleMode: true,
      includeEvidence: true,
      maxActions: 3
    });

    const serialized = JSON.stringify(result);

    expect(serialized).toContain("\"article\"");
    expect(serialized).toContain("Mock Author");
    expect(serialized).toContain("\"evidence\"");
    expect(serialized).toContain("\"claims\"");
    expect(serialized).toContain("\"paragraphEvidence\"");
  });

  it("runs a consolidated site research workflow", async () => {
    const result = await callStatePilotTool("statepilot_research_site", {
      url: "https://techcrunch.com/category/artificial-intelligence/",
      topic: "AI startup news",
      limit: 1,
      maxSnippetChars: 120,
      maxResponseBytes: 60_000,
      useMock: true
    });

    const serialized = JSON.stringify(result);

    expect(serialized).toContain("\"status\":\"success\"");
    expect(serialized).toContain("\"articles\"");
    expect(serialized).toContain("Mock Author");
    expect(serialized).toContain("\"tasksCount\":2");
    expect(serialized).toContain("\"responseMode\":\"compact\"");
    expect(serialized).toContain("\"budget\"");
    expect(serialized).toContain("\"maxResponseBytes\":60000");
    expect(serialized).not.toContain("\"article\":{");
    expect(serialized).not.toContain("\"sourceLink\"");
  });

  it("includes a total response budget for research workflows", async () => {
    const result = await callStatePilotTool("statepilot_research_site", {
      url: "https://techcrunch.com/category/artificial-intelligence/",
      topic: "AI startup news",
      limit: 1,
      responseMode: "full",
      maxResponseBytes: 5000,
      useMock: true
    });

    const serialized = JSON.stringify(result);

    expect(serialized).toContain("\"budget\"");
    expect(serialized).toContain("\"maxResponseBytes\":5000");
    expect(serialized).toContain("\"responseBytes\"");
  });

  it("returns a compact smoke-mode research result for real-agent tests", async () => {
    const result = await callStatePilotTool("statepilot_research_site", {
      url: "https://techcrunch.com/category/artificial-intelligence/",
      topic: "AI startup news",
      limit: 1,
      responseMode: "compact",
      smokeMode: true,
      maxResponseBytes: 20_000,
      useMock: true
    });

    const serialized = JSON.stringify(result);

    expect(serialized).toContain("\"smokeMode\":true");
    expect(serialized).toContain("\"smoke\"");
    expect(serialized).toContain("\"status\":\"pass\"");
    expect(serialized).toContain("\"hasClaims\":true");
    expect(serialized).toContain("\"hasCitations\":true");
    expect(serialized).not.toContain("\"claims\":[");
    expect(serialized).not.toContain("\"citations\":[");
    expect(serialized).not.toContain("\"article\":{");
  });
});
