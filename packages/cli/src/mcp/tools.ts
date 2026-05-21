import { randomUUID } from "node:crypto";
import { createRuntime, type AgentTask } from "@statepilot/core";
import { createInMemoryPredictionMemory } from "@statepilot/memory";
import { playwrightAdapter } from "@statepilot/playwright";
import { createMockBrowserAdapter } from "@statepilot/testing";
import { createAgentInstructions } from "../agent/instructions";
import {
  createBrowserLaunchPermissionMessage,
  createMissingBrowserMessage,
  isBrowserLaunchPermissionError,
  isMissingPlaywrightBrowserError
} from "../browser/playwright-browsers";
import { getProjectStatus, initProject } from "../project/project-config";
import type { JsonObject, JsonValue } from "../utils/json";
import type { McpTool } from "./types";

export const STATEPILOT_MCP_TOOLS: readonly McpTool[] = [
  {
    name: "statepilot_status",
    description: "Check StatePilot project status and runtime configuration.",
    inputSchema: {
      type: "object",
      properties: {
        root: { type: "string", description: "Project root. Defaults to current working directory." }
      }
    }
  },
  {
    name: "statepilot_init_project",
    description: "Initialize .statepilot/config.json in a project.",
    inputSchema: {
      type: "object",
      properties: {
        root: { type: "string", description: "Project root. Defaults to current working directory." }
      }
    }
  },
  {
    name: "statepilot_run_task",
    description:
      "Run a browser task through the predictable StatePilot runtime. The URL may be provided in input.url or directly in the natural-language goal. If the goal asks to research, collect links, read, scrape, extract, summarize, or return page text, StatePilot will extract page text, links, URL, and metadata automatically.",
    inputSchema: {
      type: "object",
      required: ["goal"],
      properties: {
        goal: {
          type: "string",
          description:
            "Natural-language browser task, for example: Open https://techcrunch.com/ and extract page text."
        },
        siteKey: { type: "string" },
        input: { type: "object", additionalProperties: true },
        priority: { type: "string", enum: ["low", "normal", "high", "critical"] },
        timeoutMs: { type: "number" },
        retryLimit: { type: "number" },
        maxActions: { type: "number" },
        extractText: {
          type: "boolean",
          description: "Force an extraction step after navigation so the tool returns page text."
        },
        articleMode: {
          type: "boolean",
          description:
            "Extract article-focused metadata and body content from article/main, JSON-LD, meta tags, and paragraphs."
        },
        includeEvidence: {
          type: "boolean",
          description: "Return field-level evidence snippets with source type and selectors when available."
        },
        maxLinks: {
          type: "number",
          description: "Maximum number of normalized links to include in extraction output. Defaults to 250."
        },
        useMock: {
          type: "boolean",
          description: "Use the deterministic mock browser adapter instead of Playwright. Defaults to false."
        },
        headless: { type: "boolean" }
      }
    }
  },
  {
    name: "statepilot_research_site",
    description:
      "Run a complete research workflow: open an index/category page, collect normalized links, select relevant article URLs, extract each article with articleMode/evidence, and return one consolidated JSON result so agents do not need shell/Python post-processing.",
    inputSchema: {
      type: "object",
      required: ["url"],
      properties: {
        url: { type: "string", description: "Index/category/source URL to research." },
        topic: {
          type: "string",
          description: "Topic used to rank article links, for example: AI startup news."
        },
        limit: {
          type: "number",
          description: "Maximum number of article pages to extract. Defaults to 5."
        },
        maxLinks: {
          type: "number",
          description: "Maximum links to collect from the index page. Defaults to 250."
        },
        includeEvidence: {
          type: "boolean",
          description: "Return field, claim, and paragraph evidence. Defaults to true."
        },
        responseMode: {
          type: "string",
          enum: ["compact", "full"],
          description:
            "compact returns briefing-ready fields, claims, citations, failures, and metrics. full also includes raw article payloads. Defaults to compact."
        },
        smokeMode: {
          type: "boolean",
          description:
            "Return a small machine-stable verification result instead of full research content. Intended for real-agent smoke tests and CI."
        },
        maxClaimsPerArticle: {
          type: "number",
          description: "Maximum claim candidates per article in compact mode. Defaults to 5."
        },
        maxCitationsPerArticle: {
          type: "number",
          description: "Maximum citation snippets per article in compact mode. Defaults to 5."
        },
        maxSnippetChars: {
          type: "number",
          description: "Maximum characters per claim/citation/evidence snippet in compact mode. Defaults to 320."
        },
        includeArticleMetrics: {
          type: "boolean",
          description: "Include per-article execution metrics in compact mode. Defaults to false."
        },
        maxResponseBytes: {
          type: "number",
          description:
            "Maximum serialized JSON response size. Defaults to 60000 in compact mode and 500000 in full mode."
        },
        headless: { type: "boolean" },
        timeoutMs: { type: "number" },
        useMock: {
          type: "boolean",
          description: "Use the deterministic mock browser adapter instead of Playwright. Defaults to false."
        }
      }
    }
  },
  {
    name: "statepilot_agent_instructions",
    description: "Return guidance for using StatePilot from an AI agent.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  }
];

export async function callStatePilotTool(name: string, input: JsonObject): Promise<JsonValue> {
  switch (name) {
    case "statepilot_status":
      return normalizeJson(await getProjectStatus(asString(input.root) ?? process.cwd()));
    case "statepilot_init_project":
      return normalizeJson(await initProject(asString(input.root) ?? process.cwd()));
    case "statepilot_agent_instructions":
      return { instructions: createAgentInstructions() };
    case "statepilot_run_task":
      return runTaskTool(input);
    case "statepilot_research_site":
      return researchSiteTool(input);
    default:
      throw new Error(`Unknown StatePilot MCP tool: ${name}`);
  }
}

async function researchSiteTool(input: JsonObject): Promise<JsonValue> {
  const url = asString(input.url);
  if (!url) {
    throw new Error("statepilot_research_site requires a non-empty url");
  }

  const topic = asString(input.topic) ?? "articles";
  const limit = clampInteger(asNumber(input.limit) ?? 5, 1, 10);
  const maxLinks = clampInteger(asNumber(input.maxLinks) ?? 250, 10, 500);
  const includeEvidence = input.includeEvidence !== false;
  const responseMode = input.responseMode === "full" ? "full" : "compact";
  const smokeMode = input.smokeMode === true;
  const maxClaimsPerArticle = clampInteger(asNumber(input.maxClaimsPerArticle) ?? 5, 1, 20);
  const maxCitationsPerArticle = clampInteger(asNumber(input.maxCitationsPerArticle) ?? 5, 1, 20);
  const maxSnippetChars = clampInteger(asNumber(input.maxSnippetChars) ?? 320, 80, 2_000);
  const includeArticleMetrics = input.includeArticleMetrics === true || responseMode === "full";
  const maxResponseBytes = clampInteger(
    asNumber(input.maxResponseBytes) ?? (responseMode === "compact" ? 60_000 : 500_000),
    5_000,
    1_000_000
  );
  const timeoutMs = asNumber(input.timeoutMs) ?? 60_000;
  const commonOptions: JsonObject = {
    useMock: input.useMock === true,
    timeoutMs,
    ...(typeof input.headless === "boolean" ? { headless: input.headless } : {})
  };

  const indexRun = asJsonObject(
    await runTaskTool({
      goal: `Open ${url} and collect article links for ${topic}`,
      input: { url, maxLinks },
      maxLinks,
      ...commonOptions
    })
  );
  const indexResult = asJsonObject(indexRun.result);
  const links = asJsonArray(indexResult.links).map(asJsonObject);
  const selectedLinks = selectArticleLinks(links, topic, limit, url);

  const articleRuns: readonly { readonly link: JsonObject; readonly run: JsonObject }[] = await Promise.all(
    selectedLinks.map(async (link) => {
      const articleUrl = asString(link.url) ?? "";
      try {
        const run = asJsonObject(
          await runTaskTool({
            goal: "Open the article URL and extract title, author, date, body, claims, and evidence",
            input: { url: articleUrl, articleMode: true, includeEvidence, maxLinks: 50 },
            articleMode: true,
            includeEvidence,
            maxLinks: 50,
            ...commonOptions
          })
        );

        return { link, run };
      } catch (error) {
        const failedRun: JsonObject = {
          status: "failed",
          error: {
            code: "research_article_failed",
            message: error instanceof Error ? error.message : String(error),
            retryable: true
          }
        };

        return {
          link,
          run: failedRun
        };
      }
    })
  );

  const articles = articleRuns
    .filter(({ run }) => asString(run.status) === "success")
    .map(({ link, run }) => {
      const result = asJsonObject(run.result);
      const article = asJsonObject(result.article);

      const claims = asJsonArray(article.claims)
        .map(asJsonObject)
        .slice(0, maxClaimsPerArticle)
        .map((claim) => compactClaim(claim, maxSnippetChars));
      const citations = asJsonArray(article.paragraphEvidence ?? article.evidence)
        .map(asJsonObject)
        .slice(0, maxCitationsPerArticle)
        .map((citation) => compactEvidence(citation, maxSnippetChars));
      const evidence = asJsonArray(article.evidence)
        .map(asJsonObject)
        .slice(0, 6)
        .map((item) => compactEvidence(item, maxSnippetChars));
      const compactArticle = {
        requestedUrl: asString(link.url),
        finalUrl: asString(result.url),
        title: truncateText(asString(article.title) ?? asString(result.title), maxSnippetChars),
        author: article.author,
        publishedAt: article.publishedAt,
        modifiedAt: article.modifiedAt,
        description: truncateText(asString(article.description), maxSnippetChars),
        tags: article.tags ?? [],
        claims,
        citations,
        evidence,
        ...(includeArticleMetrics ? { metrics: normalizeJson(run.metrics) } : {})
      };

      return normalizeJson({
        ...compactArticle,
        ...(responseMode === "full" ? { article } : {})
      }) as JsonObject;
    });

  const failures = articleRuns
    .filter(({ run }) => asString(run.status) !== "success")
    .map(({ link, run }) => ({
      url: asString(link.url),
      text: asString(link.text),
      error: normalizeJson(run.error)
    }));

  const response = asJsonObject(normalizeJson({
    status: failures.length > 0 ? "partial_success" : "success",
    source: {
      url,
      topic,
      responseMode,
      maxResponseBytes,
      indexTaskId: indexRun.taskId,
      indexStatus: indexRun.status,
      indexUrl: indexResult.url,
      linksCollected: links.length,
      linksSelected: selectedLinks.length
    },
    selectedLinks,
    articles,
    failures,
    metrics: {
      tasksCount: 1 + articleRuns.length,
      successCount: articles.length,
      failureCount: failures.length,
      indexMetrics: normalizeJson(indexRun.metrics)
    }
  }));

  const budgetedResponse = applyResearchResponseBudget(response, maxResponseBytes);

  return smokeMode ? createResearchSmokeResult(budgetedResponse, maxResponseBytes) : budgetedResponse;
}

function createResearchSmokeResult(research: JsonObject, maxResponseBytes: number): JsonObject {
  const source = asJsonObject(research.source);
  const articles = asJsonArray(research.articles).map(asJsonObject);
  const selectedLinks = asJsonArray(research.selectedLinks).map(asJsonObject);
  const failures = asJsonArray(research.failures).map(asJsonObject);
  const metrics = asJsonObject(research.metrics);
  const budget = asJsonObject(research.budget);
  const articleChecks = articles.map((article, index) => {
    const claims = asJsonArray(article.claims);
    const citations = asJsonArray(article.citations);
    const evidence = asJsonArray(article.evidence);
    const requestedUrl = asString(article.requestedUrl);
    const finalUrl = asString(article.finalUrl);
    const title = asString(article.title);

    return omitUndefined({
      index: index + 1,
      requestedUrl,
      finalUrl,
      title: truncateText(title, 180),
      author: asString(article.author),
      publishedAt: asString(article.publishedAt),
      hasUrl: Boolean(requestedUrl || finalUrl),
      hasTitle: Boolean(title),
      hasClaims: claims.length > 0,
      claimsCount: claims.length,
      hasCitations: citations.length > 0,
      citationsCount: citations.length,
      hasEvidence: evidence.length > 0 || citations.length > 0,
      evidenceCount: evidence.length + citations.length
    });
  });
  const status = asString(research.status) ?? "unknown";
  const linksCollected = asNumber(source.linksCollected) ?? 0;
  const linksSelected = asNumber(source.linksSelected) ?? selectedLinks.length;
  const responseMode = asString(source.responseMode);
  const failureCount = failures.length;
  const checks = [
    createSmokeCheck("tool_status_success", status === "success", `status=${status}`),
    createSmokeCheck(
      "compact_response_mode",
      responseMode === "compact",
      `source.responseMode=${responseMode ?? "missing"}`
    ),
    createSmokeCheck("links_collected", linksCollected > 0, `linksCollected=${linksCollected}`),
    createSmokeCheck("links_selected", linksSelected > 0, `linksSelected=${linksSelected}`),
    createSmokeCheck("articles_returned", articleChecks.length > 0, `articles=${articleChecks.length}`),
    createSmokeCheck(
      "article_urls_returned",
      articleChecks.length > 0 && articleChecks.every((article) => article.hasUrl === true),
      "each article should include requestedUrl or finalUrl"
    ),
    createSmokeCheck(
      "article_titles_returned",
      articleChecks.length > 0 && articleChecks.every((article) => article.hasTitle === true),
      "each article should include title"
    ),
    createSmokeCheck(
      "claims_returned",
      articleChecks.length > 0 && articleChecks.every((article) => article.hasClaims === true),
      "each article should include at least one claim"
    ),
    createSmokeCheck(
      "citations_returned",
      articleChecks.length > 0 && articleChecks.every((article) => article.hasCitations === true),
      "each article should include at least one citation"
    ),
    createSmokeCheck("no_failures", failureCount === 0, `failures=${failureCount}`),
    createSmokeCheck(
      "research_response_budget",
      (asNumber(budget.responseBytes) ?? 0) <= maxResponseBytes,
      `researchResponseBytes=${asNumber(budget.responseBytes) ?? "missing"}`
    )
  ];
  const smokeStatus = checks.every((check) => check.status === "pass") ? "pass" : "fail";
  const compactFailures = failures.map((failure) =>
    omitUndefined({
      url: asString(failure.url),
      text: truncateText(asString(failure.text), 120),
      error: normalizeJson(failure.error)
    })
  );
  const base = normalizeJson({
    status,
    smokeMode: true,
    source: {
      url: asString(source.url),
      topic: asString(source.topic),
      responseMode,
      linksCollected,
      linksSelected
    },
    articles: articleChecks,
    failures: compactFailures,
    metrics: {
      tasksCount: asNumber(metrics.tasksCount),
      successCount: asNumber(metrics.successCount),
      failureCount: asNumber(metrics.failureCount)
    },
    researchBudget: budget,
    smoke: {
      status: smokeStatus,
      checks
    }
  }) as JsonObject;

  return withResponseBudget(base, maxResponseBytes);
}

function createSmokeCheck(name: string, passed: boolean, message: string): JsonObject {
  return {
    name,
    status: passed ? "pass" : "fail",
    message
  };
}

function withResponseBudget(response: JsonObject, maxResponseBytes: number): JsonObject {
  const candidate = normalizeJson({
    ...response,
    budget: {
      maxResponseBytes,
      responseBytes: 0,
      truncated: false
    }
  }) as JsonObject;
  const responseBytes = serializedBytes(candidate);

  return normalizeJson({
    ...response,
    budget: {
      maxResponseBytes,
      responseBytes,
      truncated: responseBytes > maxResponseBytes
    }
  }) as JsonObject;
}

function applyResearchResponseBudget(response: JsonObject, maxResponseBytes: number): JsonObject {
  const originalArticles = asJsonArray(response.articles).map(asJsonObject);
  const originalSelectedLinks = asJsonArray(response.selectedLinks).map(asJsonObject);
  let articles = originalArticles;
  let selectedLinks = originalSelectedLinks;
  const reductions: string[] = [];

  const compose = (): JsonObject =>
    normalizeJson({
      ...response,
      selectedLinks,
      articles
    }) as JsonObject;

  const finish = (truncated: boolean): JsonObject => {
    const budgetBase: JsonObject = {
      maxResponseBytes,
      truncated,
      reductions,
      omittedArticles: Math.max(0, originalArticles.length - articles.length),
      omittedSelectedLinks: Math.max(0, originalSelectedLinks.length - selectedLinks.length)
    };
    let candidate = normalizeJson({
      ...compose(),
      budget: {
        ...budgetBase,
        responseBytes: 0
      }
    }) as JsonObject;
    let responseBytes = serializedBytes(candidate);
    candidate = normalizeJson({
      ...compose(),
      budget: {
        ...budgetBase,
        responseBytes
      }
    }) as JsonObject;
    responseBytes = serializedBytes(candidate);

    return normalizeJson({
      ...compose(),
      budget: {
        ...budgetBase,
        responseBytes
      }
    }) as JsonObject;
  };

  const isWithinBudget = (): boolean => serializedBytes(finish(reductions.length > 0)) <= maxResponseBytes;

  if (isWithinBudget()) {
    return finish(false);
  }

  articles = articles.map((article) => omitKeys(article, ["article", "metrics"]));
  reductions.push("removed_raw_article_payloads_and_article_metrics");
  if (isWithinBudget()) {
    return finish(true);
  }

  articles = articles.map((article) => omitKeys(article, ["evidence"]));
  reductions.push("removed_field_evidence");
  if (isWithinBudget()) {
    return finish(true);
  }

  selectedLinks = selectedLinks.map((link) =>
    omitUndefined({
      text: truncateText(asString(link.text), 120),
      url: asString(link.url)
    })
  );
  articles = articles.map((article) => compactResearchArticle(article, 160, 2, 2));
  reductions.push("trimmed_selected_links_claims_and_citations");
  if (isWithinBudget()) {
    return finish(true);
  }

  while (articles.length > 1 && !isWithinBudget()) {
    articles = articles.slice(0, -1);
  }
  if (originalArticles.length > articles.length) {
    reductions.push("omitted_lowest_ranked_articles");
  }
  if (isWithinBudget()) {
    return finish(true);
  }

  selectedLinks = [];
  articles = articles.map((article) => articleSummary(article, 140));
  reductions.push("removed_selected_links_and_kept_article_summaries");
  if (isWithinBudget()) {
    return finish(true);
  }

  while (articles.length > 1 && !isWithinBudget()) {
    articles = articles.slice(0, -1);
  }
  articles = articles.map((article) => articleSummary(article, 80));
  reductions.push("minimized_article_summaries");

  return finish(true);
}

async function runTaskTool(input: JsonObject): Promise<JsonValue> {
  const goal = asString(input.goal);
  if (!goal) {
    throw new Error("statepilot_run_task requires a non-empty goal");
  }

  const taskInput = withExtractionOptions(asJsonObject(input.input), input);
  const inferredUrl = inferUrl(goal, taskInput);
  const normalizedInput = inferredUrl ? { ...taskInput, url: inferredUrl } : taskInput;
  const useMock = input.useMock === true;
  const shouldExtractText = shouldExtractPageText(goal, input);
  const maxActions = asNumber(input.maxActions) ?? (shouldExtractText ? 6 : 12);
  const runtime = createRuntime({
    adapter: useMock ? createMockBrowserAdapter() : playwrightAdapter({ headless: input.headless !== false }),
    memory: createInMemoryPredictionMemory(),
    maxActions
  });

  const task: AgentTask<JsonObject> = {
    id: randomUUID(),
    goal: withExtractionIntent(goal, shouldExtractText),
    siteKey: asString(input.siteKey),
    input: normalizedInput,
    priority: asPriority(input.priority),
    timeoutMs: asNumber(input.timeoutMs) ?? 30_000,
    retryLimit: asNumber(input.retryLimit) ?? 1,
    createdAt: new Date()
  };

  const result = await runTaskWithFriendlyErrors(runtime, task);

  return {
    taskId: result.taskId,
    status: result.status,
    result: normalizeJson(result.result),
    error: normalizeJson(result.error),
    metrics: {
      ...result.metrics,
      startedAt: result.metrics.startedAt.toISOString(),
      completedAt: result.metrics.completedAt.toISOString()
    }
  };
}

async function runTaskWithFriendlyErrors(
  runtime: ReturnType<typeof createRuntime>,
  task: AgentTask<JsonObject>
): Promise<Awaited<ReturnType<typeof runtime.run>>> {
  try {
    return await runtime.run(task);
  } catch (error) {
    if (isMissingPlaywrightBrowserError(error)) {
      return {
        taskId: task.id,
        status: "failed",
        error: {
          code: "playwright_browser_missing",
          message: createMissingBrowserMessage(error),
          retryable: true
        },
        metrics: {
          startedAt: new Date(),
          completedAt: new Date(),
          durationMs: 0,
          actionsCount: 0,
          predictionConfidenceAverage: 0,
          llmCallsCount: 0,
          recoveryCount: 0
        }
      };
    }

    if (isBrowserLaunchPermissionError(error)) {
      return {
        taskId: task.id,
        status: "failed",
        error: {
          code: "browser_launch_blocked",
          message: createBrowserLaunchPermissionMessage(error),
          retryable: true
        },
        metrics: {
          startedAt: new Date(),
          completedAt: new Date(),
          durationMs: 0,
          actionsCount: 0,
          predictionConfidenceAverage: 0,
          llmCallsCount: 0,
          recoveryCount: 0
        }
      };
    }

    throw error;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asJsonArray(value: unknown): readonly JsonValue[] {
  return Array.isArray(value) ? (value as readonly JsonValue[]) : [];
}

function asJsonObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asPriority(value: unknown): AgentTask["priority"] {
  return value === "low" || value === "high" || value === "critical" ? value : "normal";
}

function withExtractionOptions(taskInput: JsonObject, input: JsonObject): JsonObject {
  return {
    ...taskInput,
    ...(input.articleMode === true ? { articleMode: true } : {}),
    ...(input.includeEvidence === true ? { includeEvidence: true } : {}),
    ...(typeof input.maxLinks === "number" && Number.isFinite(input.maxLinks) ? { maxLinks: input.maxLinks } : {})
  };
}

function inferUrl(goal: string, input: JsonObject): string | undefined {
  const explicit = asString(input.url);
  if (explicit) {
    return explicit;
  }

  const match = goal.match(/https?:\/\/[^\s<>"')\]]+/i);
  return match ? match[0].replace(/[.,;:!?]+$/, "") : undefined;
}

function shouldExtractPageText(goal: string, input: JsonObject): boolean {
  if (input.extractText === true || input.articleMode === true || input.includeEvidence === true) {
    return true;
  }

  return (
    /\b(extract|read|scrape|summari[sz]e|return|get|capture|collect)\b.*\b(text|content|copy|headlines?|article|page|url|author|date|summary)\b/i.test(
      goal
    ) ||
    /\b(research|collect|find|list|scan)\b.*\b(news|articles?|links?|urls?|headlines?|posts?|stories)\b/i.test(goal) ||
    /\b(page text|body text|visible text|text from|companies mentioned|conte[uú]do|texto|dados|tabela|table|document)\b/i.test(
      goal
    )
  );
}

function withExtractionIntent(goal: string, shouldExtractText: boolean): string {
  if (!shouldExtractText || hasExtractionIntent(goal)) {
    return goal;
  }

  return `${goal} and extract page text`;
}

function hasExtractionIntent(goal: string): boolean {
  return /\b(extract|read|scrape|summari[sz]e|research|collect|find|list|scan|text|content|copy|headlines?|article|articles?|links?|urls?|page text|visible text|table|document|dados|tabela|texto)\b/i.test(
    goal
  );
}

function compactClaim(claim: JsonObject, maxChars: number): JsonObject {
  return omitUndefined({
    text: truncateText(asString(claim.text), maxChars),
    snippet: truncateText(asString(claim.snippet), maxChars),
    selector: asString(claim.selector),
    categories: asJsonArray(claim.categories)
      .filter(isPrimitiveJson)
      .map((category) => String(category)),
    confidence: asNumber(claim.confidence)
  });
}

function compactEvidence(evidence: JsonObject, maxChars: number): JsonObject {
  return omitUndefined({
    field: asString(evidence.field),
    value: truncateText(asString(evidence.value), maxChars),
    source: asString(evidence.source),
    selector: asString(evidence.selector),
    snippet: truncateText(asString(evidence.snippet), maxChars),
    confidence: asNumber(evidence.confidence)
  });
}

function compactResearchArticle(
  article: JsonObject,
  maxChars: number,
  maxClaims: number,
  maxCitations: number
): JsonObject {
  return omitUndefined({
    ...articleSummary(article, maxChars),
    tags: asJsonArray(article.tags).filter(isPrimitiveJson).map(String).slice(0, 8),
    claims: asJsonArray(article.claims)
      .map(asJsonObject)
      .slice(0, maxClaims)
      .map((claim) => compactClaim(claim, maxChars)),
    citations: asJsonArray(article.citations)
      .map(asJsonObject)
      .slice(0, maxCitations)
      .map((citation) => compactEvidence(citation, maxChars))
  });
}

function articleSummary(article: JsonObject, maxChars: number): JsonObject {
  return omitUndefined({
    requestedUrl: asString(article.requestedUrl),
    finalUrl: asString(article.finalUrl),
    title: truncateText(asString(article.title), maxChars),
    author: asString(article.author),
    publishedAt: asString(article.publishedAt),
    modifiedAt: asString(article.modifiedAt),
    description: truncateText(asString(article.description), maxChars)
  });
}

function omitKeys(object: JsonObject, keys: readonly string[]): JsonObject {
  const keysToOmit = new Set(keys);
  return Object.fromEntries(Object.entries(object).filter(([key]) => !keysToOmit.has(key)));
}

function omitUndefined(input: Record<string, JsonValue | undefined>): JsonObject {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as JsonObject;
}

function isPrimitiveJson(value: JsonValue): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function truncateText(value: string | undefined, maxChars: number): string | undefined {
  if (!value || value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function serializedBytes(value: JsonValue): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function selectArticleLinks(
  links: readonly JsonObject[],
  topic: string,
  limit: number,
  sourceUrl: string
): readonly JsonObject[] {
  const seen = new Set<string>();

  return links
    .map((link) => ({ link, score: scoreArticleLink(link, topic, sourceUrl) }))
    .filter(({ link, score }) => {
      const url = normalizeUrl(asString(link.url));
      if (!url || seen.has(url) || score <= 0) {
        return false;
      }

      seen.add(url);
      return true;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ link }) => link);
}

function scoreArticleLink(link: JsonObject, topic: string, sourceUrl: string): number {
  const url = asString(link.url);
  if (!url || isBlockedResearchUrl(url)) {
    return 0;
  }

  const text = asString(link.text) ?? "";
  const label = `${text} ${url}`.toLowerCase();
  const topicTerms = topic
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3);
  let score = 0;

  if (isSameOrigin(url, sourceUrl)) {
    score += 2;
  }

  if (isLikelyArticleUrl(url)) {
    score += 8;
  }

  if (/\b(ai|artificial-intelligence|startup|startups|founder|raises?|raised|seed|series|funding|venture|model|agents?|search|security)\b/i.test(label)) {
    score += 4;
  }

  score += topicTerms.filter((term) => label.includes(term)).length;

  if (link.visible === false) {
    score -= 2;
  }

  if (/\b(author|tag|category|about|privacy|terms|login|subscribe|newsletter|video|podcast|event)\b/i.test(label)) {
    score -= 5;
  }

  return score;
}

function normalizeUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function isSameOrigin(url: string, sourceUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(sourceUrl).origin;
  } catch {
    return false;
  }
}

function isLikelyArticleUrl(url: string): boolean {
  try {
    return /\/20\d{2}\/\d{2}\/\d{2}\//.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function isBlockedResearchUrl(url: string): boolean {
  return /#|\/tag\/|\/author\/|\/category\/|\/events?\/|\/podcasts?\/|\/video\/|\/about|\/privacy|\/terms|mailto:|javascript:/i.test(
    url
  );
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function normalizeJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as JsonValue;
}
