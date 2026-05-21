import type { WaitCondition } from "@statepilot/action-model";
import type { RawBrowserState } from "@statepilot/browser-state";
import type {
  BrowserAdapter,
  BrowserPage,
  BrowserSession,
  BrowserSessionConfig,
  ExtractionOptions,
  PageExtraction,
  ScreenshotOptions
} from "@statepilot/core";
import { mockRawBrowserState } from "../fixtures/browser-state.fixture";

export interface MockBrowserAdapterOptions {
  readonly initialState?: RawBrowserState;
}

export class MockBrowserPage implements BrowserPage {
  readonly id = "mock-page";
  readonly actions: string[] = [];
  private state: RawBrowserState;

  constructor(initialState: RawBrowserState = mockRawBrowserState()) {
    this.state = initialState;
  }

  async goto(url: string): Promise<void> {
    this.actions.push(`goto:${url}`);
    this.state = {
      ...this.state,
      url,
      title: "Loaded",
      domSnapshot: `<main>${url}</main>`,
      visibleText: `Loaded ${url}`,
      interactiveElements: [
        {
          role: "link",
          text: "Example article",
          selector: "a:nth-of-type(1)",
          stableSelector: `${new URL("/2026/05/20/example-article/", url).href}`,
          visible: true,
          enabled: true
        }
      ]
    };
  }

  async click(selector: string): Promise<void> {
    this.actions.push(`click:${selector}`);
  }

  async fill(selector: string, value: string): Promise<void> {
    this.actions.push(`fill:${selector}:${value}`);
  }

  async press(key: string): Promise<void> {
    this.actions.push(`press:${key}`);
  }

  async waitFor(condition: WaitCondition): Promise<void> {
    this.actions.push(`wait_for:${condition.type}`);
  }

  async extractText(): Promise<string> {
    this.actions.push("extract_text");
    return this.state.visibleText ?? "";
  }

  async extractPage(options: ExtractionOptions = {}): Promise<PageExtraction> {
    this.actions.push("extract_page");
    const evidence = [
      {
        field: "title",
        value: this.state.title,
        source: "dom" as const,
        selector: "title",
        snippet: this.state.title ?? "",
        confidence: 0.7
      }
    ].filter((item) => item.value);

    return {
      url: this.state.url,
      title: this.state.title,
      text: this.state.visibleText ?? "",
      links: (this.state.interactiveElements ?? [])
        .filter((element) => element.role === "link")
        .map((element) => ({
          text: element.text ?? element.ariaLabel ?? element.selector,
          url: element.stableSelector?.startsWith("http") ? element.stableSelector : element.selector,
          selector: element.selector,
          visible: element.visible,
          internal: true
        })),
      metadata: {
        title: this.state.title,
        canonicalUrl: this.state.url
      },
      article: options.articleMode
        ? {
            title: this.state.title,
            author: "Mock Author",
            publishedAt: "2026-05-20",
            description: this.state.visibleText,
            tags: ["mock"],
            paragraphs: [this.state.visibleText ?? ""].filter(Boolean),
            paragraphEvidence: options.includeEvidence
              ? [
                  {
                    field: "paragraphs.0",
                    value: this.state.visibleText,
                    source: "dom" as const,
                    selector: "article p:nth-of-type(1)",
                    snippet: this.state.visibleText ?? "",
                    confidence: 0.72
                  }
                ].filter((item) => item.value)
              : undefined,
            paragraphDetails: options.includeEvidence
              ? [
                  {
                    index: 0,
                    text: this.state.visibleText ?? "",
                    selector: "article p:nth-of-type(1)"
                  }
                ].filter((item) => item.text)
              : undefined,
            claims: [
              {
                text: this.state.visibleText ?? "",
                snippet: this.state.visibleText ?? "",
                selector: "article p:nth-of-type(1)",
                categories: ["product"],
                confidence: 0.68
              }
            ].filter((item) => item.text),
            text: this.state.visibleText ?? "",
            evidence: options.includeEvidence ? evidence : undefined
          }
        : undefined,
      evidence: options.includeEvidence ? evidence : undefined
    };
  }

  async getState(): Promise<RawBrowserState> {
    return this.state;
  }

  async screenshot(_options?: ScreenshotOptions): Promise<Buffer> {
    return Buffer.from("");
  }

  async close(): Promise<void> {
    this.actions.push("close");
  }
}

export class MockBrowserSession implements BrowserSession {
  readonly id = "mock-session";
  readonly page: MockBrowserPage;

  constructor(page: MockBrowserPage) {
    this.page = page;
  }

  async openPage(url?: string): Promise<BrowserPage> {
    if (url) {
      await this.page.goto(url);
    }

    return this.page;
  }

  async close(): Promise<void> {
    await this.page.close();
  }
}

export class MockBrowserAdapter implements BrowserAdapter {
  readonly page: MockBrowserPage;

  constructor(options: MockBrowserAdapterOptions = {}) {
    this.page = new MockBrowserPage(options.initialState);
  }

  async createSession(_config?: BrowserSessionConfig): Promise<BrowserSession> {
    return new MockBrowserSession(this.page);
  }
}

export function createMockBrowserAdapter(options?: MockBrowserAdapterOptions): MockBrowserAdapter {
  return new MockBrowserAdapter(options);
}
