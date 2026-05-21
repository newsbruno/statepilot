import { describe, expect, it } from "vitest";
import type { PredictionEngine } from "@statepilot/predictor";
import type {
  BrowserAdapter,
  BrowserPage,
  BrowserSession,
  ExtractionOptions,
  PageExtraction
} from "../browser/browser-adapter";
import { createRuntime } from "./create-runtime";

class FakePage implements BrowserPage {
  readonly id = "page-1";
  private url = "about:blank";

  async goto(url: string): Promise<void> {
    this.url = url;
  }

  async click(): Promise<void> {}
  async fill(): Promise<void> {}
  async press(): Promise<void> {}
  async waitFor(): Promise<void> {}
  async extractText(): Promise<string> {
    return "ok";
  }
  async extractPage(options: ExtractionOptions = {}): Promise<PageExtraction> {
    return {
      url: this.url,
      title: "Loaded",
      text: "ok",
      links: [
        {
          text: "Article",
          url: "https://example.com/article",
          selector: "a:nth-of-type(1)",
          visible: true,
          internal: true
        }
      ],
      metadata: {
        title: "Loaded",
        canonicalUrl: this.url
      },
      article: options.articleMode
        ? {
            title: "Loaded",
            author: "Test Author",
            publishedAt: "2026-05-20",
            tags: ["test"],
            paragraphs: ["ok"],
            paragraphEvidence: options.includeEvidence
              ? [
                  {
                    field: "paragraphs.0",
                    value: "ok",
                    source: "dom",
                    selector: "article p:nth-of-type(1)",
                    snippet: "ok",
                    confidence: 0.72
                  }
                ]
              : undefined,
            paragraphDetails: options.includeEvidence
              ? [
                  {
                    index: 0,
                    text: "ok",
                    selector: "article p:nth-of-type(1)"
                  }
                ]
              : undefined,
            claims: [
              {
                text: "ok",
                snippet: "ok",
                selector: "article p:nth-of-type(1)",
                categories: ["product"],
                confidence: 0.68
              }
            ],
            text: "ok",
            evidence: options.includeEvidence
              ? [
                  {
                    field: "title",
                    value: "Loaded",
                    source: "dom",
                    selector: "h1",
                    snippet: "Loaded",
                    confidence: 0.7
                  }
                ]
              : undefined
          }
        : undefined
    };
  }
  async screenshot(): Promise<Buffer> {
    return Buffer.from("");
  }
  async close(): Promise<void> {}

  async getState() {
    return {
      url: this.url,
      title: this.url === "about:blank" ? "Blank" : "Loaded",
      domSnapshot: this.url,
      visibleText: this.url === "about:blank" ? "" : "Loaded"
    };
  }
}

class HiddenClickPage extends FakePage {
  override async click(): Promise<void> {
    throw new Error("hidden skip link");
  }
}

class FakeSession implements BrowserSession {
  readonly id = "session-1";
  readonly page: BrowserPage;

  constructor(page: BrowserPage = new FakePage()) {
    this.page = page;
  }

  async openPage(): Promise<BrowserPage> {
    return this.page;
  }

  async close(): Promise<void> {}
}

class FakeAdapter implements BrowserAdapter {
  constructor(private readonly page: BrowserPage = new FakePage()) {}

  async createSession(): Promise<BrowserSession> {
    return new FakeSession(this.page);
  }
}

describe("createRuntime", () => {
  it("runs a simple navigation task and stores the transition", async () => {
    const runtime = createRuntime({
      adapter: new FakeAdapter(),
      maxActions: 3
    });

    const result = await runtime.run({
      id: "task-1",
      goal: "Open page",
      siteKey: "demo",
      input: { url: "https://example.com" },
      priority: "normal",
      timeoutMs: 1_000,
      retryLimit: 0,
      createdAt: new Date("2026-05-20T00:00:00.000Z")
    });

    expect(result.status).toBe("success");
    expect(result.metrics.actionsCount).toBe(1);
  });

  it("falls back to extraction when an extraction task predicts a hidden click", async () => {
    const predictor: PredictionEngine = {
      async predict(input) {
        if (input.previousActions.length === 0) {
          return {
            action: { type: "navigate", url: "https://techcrunch.com/2026/05/20/example/" },
            expectedNextState: { url: "https://techcrunch.com/2026/05/20/example/" },
            confidence: 0.9,
            source: "heuristic",
            reason: "go"
          };
        }

        return {
          action: { type: "click", selector: "#wp-skip-link" },
          confidence: 0.72,
          source: "transition_memory",
          reason: "stale memory"
        };
      }
    };

    const runtime = createRuntime({
      adapter: new FakeAdapter(new HiddenClickPage()),
      predictor,
      maxActions: 3
    });

    const result = await runtime.run({
      id: "task-1",
      goal: "Open article and extract title, author, date, and page text",
      siteKey: "demo",
      input: { url: "https://techcrunch.com/2026/05/20/example/" },
      priority: "normal",
      timeoutMs: 1_000,
      retryLimit: 0,
      createdAt: new Date("2026-05-20T00:00:00.000Z")
    });

    expect(result.status).toBe("success");
    expect(result.result).toMatchObject({
      text: "ok",
      links: [{ url: "https://example.com/article" }],
      article: {
        title: "Loaded",
        evidence: [{ field: "title", snippet: "Loaded" }],
        paragraphEvidence: [{ field: "paragraphs.0", snippet: "ok" }],
        claims: [{ categories: ["product"], snippet: "ok" }]
      }
    });
    expect(result.metrics.actionsCount).toBe(2);
  });
});
