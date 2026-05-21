import { chromium } from "playwright";
import type { Browser as PlaywrightBrowser, BrowserContext, Page } from "playwright";
import type {
  BrowserAdapter,
  BrowserPage,
  BrowserSession,
  BrowserSessionConfig,
  ExtractionOptions,
  PageExtraction,
  ScreenshotOptions
} from "@statepilot/core";
import type { WaitCondition } from "@statepilot/action-model";
import type { RawBrowserState } from "@statepilot/browser-state";
import { readPlaywrightState } from "./state/playwright-state-reader";

const PAGE_LOAD_TIMEOUT_MS = 15_000;
const CONTENT_READY_TIMEOUT_MS = 10_000;

export interface PlaywrightAdapterConfig extends BrowserSessionConfig {
  readonly browserName?: "chromium";
}

export class PlaywrightBrowserAdapter implements BrowserAdapter {
  private readonly defaults: PlaywrightAdapterConfig;

  constructor(defaults: PlaywrightAdapterConfig = {}) {
    this.defaults = defaults;
  }

  async createSession(config: BrowserSessionConfig = {}): Promise<BrowserSession> {
    const merged = { ...this.defaults, ...config };
    const browser = await chromium.launch({ headless: merged.headless ?? true });
    const context = await browser.newContext({
      viewport: merged.viewport,
      userAgent: merged.userAgent
    });

    return new PlaywrightBrowserSession(browser, context);
  }
}

export class PlaywrightBrowserSession implements BrowserSession {
  readonly id = crypto.randomUUID();

  constructor(
    private readonly browser: PlaywrightBrowser,
    private readonly context: BrowserContext
  ) {}

  async openPage(url?: string): Promise<BrowserPage> {
    const page = await this.context.newPage();
    const wrapped = new PlaywrightBrowserPage(page);

    if (url) {
      await wrapped.goto(url);
    }

    return wrapped;
  }

  async close(): Promise<void> {
    await this.context.close();
    await this.browser.close();
  }
}

export class PlaywrightBrowserPage implements BrowserPage {
  readonly id = crypto.randomUUID();

  constructor(private readonly page: Page) {}

  async goto(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
    await this.waitForUsefulPageContent();
  }

  async click(selector: string): Promise<void> {
    const locator = this.page.locator(selector).first();
    const actionable = await locator
      .evaluate((node) => {
        const element = node as HTMLElement;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const right = rect.x + rect.width;
        const bottom = rect.y + rect.height;
        const nativeVisible =
          typeof element.checkVisibility === "function"
            ? element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
            : true;
        const clipped = (style.clip && style.clip !== "auto") || (style.clipPath && style.clipPath !== "none");
        const screenReaderOnly = ["screen-reader-text", "sr-only", "visually-hidden"].some((className) =>
          element.classList.contains(className)
        );
        const disabled = "disabled" in element && Boolean((element as HTMLButtonElement).disabled);

        return (
          nativeVisible &&
          !screenReaderOnly &&
          !clipped &&
          !disabled &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) > 0 &&
          rect.width > 0 &&
          rect.height > 0 &&
          right > 0 &&
          bottom > 0
        );
      })
      .catch(() => false);

    if (!actionable) {
      throw new Error(`Cannot click "${selector}" because the element is hidden, disabled, or not actionable.`);
    }

    await locator.click({ timeout: CONTENT_READY_TIMEOUT_MS });
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.page.fill(selector, value);
  }

  async press(key: string): Promise<void> {
    await this.page.keyboard.press(key);
  }

  async waitFor(condition: WaitCondition): Promise<void> {
    switch (condition.type) {
      case "selector":
        await this.page.waitForSelector(condition.selector, { state: condition.state ?? "visible" });
        return;
      case "url":
        await this.page.waitForURL(condition.value);
        return;
      case "timeout":
        await this.page.waitForTimeout(condition.ms);
        return;
      case "network_idle":
        await this.page.waitForLoadState("networkidle");
        return;
    }
  }

  async extractText(): Promise<string> {
    await this.waitForUsefulPageContent();
    return this.page.locator("body").innerText({ timeout: CONTENT_READY_TIMEOUT_MS }).catch(() => "");
  }

  async extractPage(options: ExtractionOptions = {}): Promise<PageExtraction> {
    await this.waitForUsefulPageContent();
    return this.page.evaluate((extractOptions) => {
      const pageUrl = window.location.href;
      const pageOrigin = window.location.origin;
      const title = document.title || undefined;
      const description = getMetaContent("description") || getMetaContent("og:description");
      const canonicalUrl = document.querySelector<HTMLLinkElement>("link[rel='canonical']")?.href;
      const language = document.documentElement.lang || undefined;
      const text = document.body?.innerText ?? "";
      const maxLinks = extractOptions.maxLinks ?? 250;

      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
        .map((anchor, index) => {
          const url = anchor.href;
          const linkText = normalize(anchor.innerText || anchor.textContent || anchor.getAttribute("aria-label") || "");
          const linkTitle = anchor.title || anchor.getAttribute("aria-label") || undefined;

          return {
            text: linkText || linkTitle || url,
            url,
            selector: buildSelector(anchor, index),
            title: linkTitle,
            rel: anchor.rel || undefined,
            target: anchor.target || undefined,
            visible: isVisible(anchor),
            internal: safeOrigin(url) === pageOrigin
          };
        })
        .filter((link) => link.url && link.text && !isLikelySkipLink(link.text, link.url))
        .slice(0, maxLinks);

      const article = extractOptions.articleMode ? extractArticle(extractOptions.includeEvidence === true) : undefined;
      const evidence = extractOptions.includeEvidence === true ? buildPageEvidence(title, description, canonicalUrl) : undefined;

      return {
        url: pageUrl,
        title,
        text,
        links,
        metadata: {
          title,
          description,
          canonicalUrl,
          language
        },
        article,
        evidence
      };

      function getMetaContent(name: string): string | undefined {
        return (
          document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ||
          document.querySelector<HTMLMetaElement>(`meta[property="${name}"]`)?.content ||
          undefined
        );
      }

      function buildSelector(element: HTMLElement, index: number): string {
        if (element.id) {
          return `#${CSS.escape(element.id)}`;
        }

        const dataTestId = element.getAttribute("data-testid");
        if (dataTestId) {
          return `[data-testid="${CSS.escape(dataTestId)}"]`;
        }

        return `${element.tagName.toLowerCase()}:nth-of-type(${index + 1})`;
      }

      function isVisible(element: HTMLElement): boolean {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const right = rect.x + rect.width;
        const bottom = rect.y + rect.height;
        const nativeVisible =
          typeof element.checkVisibility === "function"
            ? element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
            : true;
        const clipped = (style.clip && style.clip !== "auto") || (style.clipPath && style.clipPath !== "none");
        const screenReaderOnly = ["screen-reader-text", "sr-only", "visually-hidden"].some((className) =>
          element.classList.contains(className)
        );

        return (
          nativeVisible &&
          !screenReaderOnly &&
          !clipped &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) > 0 &&
          rect.width > 0 &&
          rect.height > 0 &&
          right > 0 &&
          bottom > 0
        );
      }

      function isLikelySkipLink(textValue: string, urlValue: string): boolean {
        const label = `${textValue} ${urlValue}`.toLowerCase();
        return /\b(skip|skip-link|skip_to|skip-to|wp-skip-link|screen-reader-text)\b/.test(label);
      }

      function normalize(value: string): string {
        return value.replace(/\s+/g, " ").trim();
      }

      function safeOrigin(urlValue: string): string | undefined {
        try {
          return new URL(urlValue).origin;
        } catch {
          return undefined;
        }
      }

      function extractArticle(includeEvidence: boolean) {
        const evidenceItems: Array<{
          field: string;
          value?: string;
          source: "json_ld" | "meta" | "dom" | "url";
          selector?: string;
          snippet: string;
          confidence?: number;
        }> = [];
        const jsonLdArticle = findJsonLdArticle();
        const articleRoot = document.querySelector<HTMLElement>("article") ?? document.querySelector<HTMLElement>("main");
        const titleValue =
          valueFromJsonLd(jsonLdArticle, "headline") ||
          valueFromJsonLd(jsonLdArticle, "name") ||
          getMetaContent("og:title") ||
          textFromSelector("article h1, main h1, h1");
        const authorValue =
          authorFromJsonLd(jsonLdArticle?.author) ||
          getMetaContent("author") ||
          textFromSelector("[rel='author'], [class*='author'], [class*='byline']");
        const publishedAtValue =
          valueFromJsonLd(jsonLdArticle, "datePublished") ||
          getMetaContent("article:published_time") ||
          attributeFromSelector("time[datetime]", "datetime") ||
          textFromSelector("time");
        const modifiedAtValue = valueFromJsonLd(jsonLdArticle, "dateModified") || getMetaContent("article:modified_time");
        const descriptionValue =
          valueFromJsonLd(jsonLdArticle, "description") || getMetaContent("description") || getMetaContent("og:description");
        const imageValue = imageFromJsonLd(jsonLdArticle?.image) || getMetaContent("og:image");
        const sectionValue = valueFromJsonLd(jsonLdArticle, "articleSection") || getMetaContent("article:section");
        const tagsValue = unique([
          ...keywordsFromJsonLd(jsonLdArticle?.keywords),
          ...Array.from(document.querySelectorAll<HTMLMetaElement>("meta[property='article:tag']")).map((tag) => tag.content)
        ]);
        const paragraphDetails = Array.from((articleRoot ?? document.body).querySelectorAll<HTMLParagraphElement>("p"))
          .map((paragraph, index) => ({
            index,
            text: normalize(paragraph.innerText || paragraph.textContent || ""),
            selector: paragraphSelector(articleRoot, index)
          }))
          .filter((paragraph) => paragraph.text.length >= 40)
          .slice(0, 80);
        const paragraphs = paragraphDetails.map((paragraph) => paragraph.text);
        const paragraphEvidence = paragraphDetails.map((paragraph) => ({
          field: `paragraphs.${paragraph.index}`,
          value: paragraph.text,
          source: "dom" as const,
          selector: paragraph.selector,
          snippet: paragraph.text,
          confidence: 0.72
        }));
        const claims = paragraphDetails
          .map((paragraph) => claimFromParagraph(paragraph.text, paragraph.selector))
          .filter(
            (
              claim
            ): claim is {
              text: string;
              snippet: string;
              selector?: string;
              categories: string[];
              confidence: number;
            } => Boolean(claim)
          )
          .slice(0, 20);

        addEvidence(evidenceItems, "title", titleValue, sourceFor(titleValue, jsonLdArticle, "headline", "og:title"), "article h1, main h1, h1");
        addEvidence(
          evidenceItems,
          "author",
          authorValue,
          jsonLdArticle?.author ? "json_ld" : getMetaContent("author") ? "meta" : "dom",
          "[rel='author'], [class*='author'], [class*='byline']"
        );
        addEvidence(
          evidenceItems,
          "publishedAt",
          publishedAtValue,
          valueFromJsonLd(jsonLdArticle, "datePublished") ? "json_ld" : getMetaContent("article:published_time") ? "meta" : "dom",
          "time[datetime], time"
        );
        addEvidence(evidenceItems, "description", descriptionValue, valueFromJsonLd(jsonLdArticle, "description") ? "json_ld" : "meta");
        if (paragraphs[0]) {
          evidenceItems.push({
            field: "paragraphs",
            value: paragraphs[0],
            source: "dom",
            selector: "article p, main p, p",
            snippet: paragraphs[0],
            confidence: 0.72
          });
        }

        return {
          title: titleValue,
          author: authorValue,
          publishedAt: publishedAtValue,
          modifiedAt: modifiedAtValue,
          description: descriptionValue,
          image: imageValue,
          section: sectionValue,
          tags: tagsValue,
          paragraphs,
          paragraphEvidence: includeEvidence ? paragraphEvidence : undefined,
          paragraphDetails: includeEvidence ? paragraphDetails : undefined,
          claims,
          text: paragraphs.join("\n\n"),
          evidence: includeEvidence ? evidenceItems : undefined
        };
      }

      function buildPageEvidence(titleValue?: string, descriptionValue?: string, canonicalUrlValue?: string) {
        const items: Array<{
          field: string;
          value?: string;
          source: "json_ld" | "meta" | "dom" | "url";
          selector?: string;
          snippet: string;
          confidence?: number;
        }> = [];
        addEvidence(items, "url", pageUrl, "url");
        addEvidence(items, "title", titleValue, "dom", "title");
        addEvidence(items, "description", descriptionValue, "meta", "meta[name='description'], meta[property='og:description']");
        addEvidence(items, "canonicalUrl", canonicalUrlValue, "meta", "link[rel='canonical']");
        return items;
      }

      function findJsonLdArticle(): Record<string, unknown> | undefined {
        for (const script of Array.from(document.querySelectorAll<HTMLScriptElement>("script[type='application/ld+json']"))) {
          const parsed = parseJson(script.textContent ?? "");
          const article = findArticleObject(parsed);
          if (article) {
            return article;
          }
        }

        return undefined;
      }

      function parseJson(value: string): unknown {
        try {
          return JSON.parse(value);
        } catch {
          return undefined;
        }
      }

      function findArticleObject(value: unknown): Record<string, unknown> | undefined {
        if (Array.isArray(value)) {
          for (const item of value) {
            const found = findArticleObject(item);
            if (found) {
              return found;
            }
          }

          return undefined;
        }

        if (!value || typeof value !== "object") {
          return undefined;
        }

        const record = value as Record<string, unknown>;
        if (isArticleType(record["@type"])) {
          return record;
        }

        return findArticleObject(record["@graph"]);
      }

      function isArticleType(value: unknown): boolean {
        const types = Array.isArray(value) ? value : [value];
        return types.some(
          (type) =>
            typeof type === "string" && ["article", "newsarticle", "blogposting", "report"].includes(type.toLowerCase())
        );
      }

      function valueFromJsonLd(record: Record<string, unknown> | undefined, key: string): string | undefined {
        const value = record?.[key];
        if (typeof value === "string" || typeof value === "number") {
          return normalize(String(value));
        }

        return undefined;
      }

      function authorFromJsonLd(value: unknown): string | undefined {
        if (typeof value === "string") {
          return normalize(value);
        }

        if (Array.isArray(value)) {
          return unique(value.map(authorFromJsonLd).filter((author): author is string => Boolean(author))).join(", ") || undefined;
        }

        if (value && typeof value === "object") {
          const record = value as Record<string, unknown>;
          return valueFromJsonLd(record, "name");
        }

        return undefined;
      }

      function imageFromJsonLd(value: unknown): string | undefined {
        if (typeof value === "string") {
          return value;
        }

        if (Array.isArray(value)) {
          return imageFromJsonLd(value[0]);
        }

        if (value && typeof value === "object") {
          const record = value as Record<string, unknown>;
          return valueFromJsonLd(record, "url");
        }

        return undefined;
      }

      function keywordsFromJsonLd(value: unknown): string[] {
        if (typeof value === "string") {
          return value.split(",").map(normalize).filter(Boolean);
        }

        if (Array.isArray(value)) {
          return value.map((keyword) => (typeof keyword === "string" ? normalize(keyword) : "")).filter(Boolean);
        }

        return [];
      }

      function textFromSelector(selector: string): string | undefined {
        const element = document.querySelector<HTMLElement>(selector);
        return element ? normalize(element.innerText || element.textContent || "") : undefined;
      }

      function attributeFromSelector(selector: string, attribute: string): string | undefined {
        return document.querySelector<HTMLElement>(selector)?.getAttribute(attribute) ?? undefined;
      }

      function sourceFor(
        value: string | undefined,
        jsonLdArticle: Record<string, unknown> | undefined,
        jsonLdKey: string,
        metaKey: string
      ): "json_ld" | "meta" | "dom" {
        if (value && valueFromJsonLd(jsonLdArticle, jsonLdKey) === value) {
          return "json_ld";
        }

        if (value && getMetaContent(metaKey) === value) {
          return "meta";
        }

        return "dom";
      }

      function addEvidence(
        items: Array<{
          field: string;
          value?: string;
          source: "json_ld" | "meta" | "dom" | "url";
          selector?: string;
          snippet: string;
          confidence?: number;
        }>,
        field: string,
        value: string | undefined,
        source: "json_ld" | "meta" | "dom" | "url",
        selector?: string
      ): void {
        if (!value) {
          return;
        }

        items.push({
          field,
          value,
          source,
          selector,
          snippet: value,
          confidence: source === "json_ld" ? 0.95 : source === "meta" ? 0.85 : source === "url" ? 0.8 : 0.7
        });
      }

      function unique(values: readonly string[]): string[] {
        return Array.from(new Set(values.map(normalize).filter(Boolean)));
      }

      function paragraphSelector(root: HTMLElement | null, index: number): string {
        const prefix = root?.tagName.toLowerCase() === "article" ? "article" : root?.tagName.toLowerCase() === "main" ? "main" : "body";
        return `${prefix} p:nth-of-type(${index + 1})`;
      }

      function claimFromParagraph(
        textValue: string,
        selector: string | undefined
      ):
        | {
            text: string;
            snippet: string;
            selector?: string;
            categories: string[];
            confidence: number;
          }
        | undefined {
        const categories = claimCategories(textValue);
        if (categories.length === 0) {
          return undefined;
        }

        return {
          text: textValue,
          snippet: textValue.length > 700 ? `${textValue.slice(0, 697)}...` : textValue,
          selector,
          categories,
          confidence: Math.min(0.86, 0.62 + categories.length * 0.06)
        };
      }

      function claimCategories(textValue: string): string[] {
        const patterns: Array<[string, RegExp]> = [
          ["funding", /\$[\d,.]+\s?(?:m|million|b|billion)|\braised\b|\bseed\b|\bseries\b|\bvaluation\b|\bround\b/i],
          ["investor", /\bled by\b|\bbacked by\b|\binvestors?\b|\bparticipation\b|\bventures?\b|\bcapital\b|\bsequoia\b|\bandreessen\b|\ba16z\b/i],
          ["acquisition", /\bacquir|\bbuyout\b|\bmerger\b|\bdeal\b|\bpartnership\b|\bpreinstall\b/i],
          ["traction", /\bcustomers?\b|\busers?\b|\bused by\b|\brevenue\b|\bARR\b|\benterprise\b|\bmonthly\b|\bbillion\b|\bmillion\b/i],
          ["product", /\bAI\b|\bagents?\b|\bmodel\b|\bplatform\b|\bAPI\b|\breleased\b|\blaunched\b|\bproduct\b/i]
        ];

        return patterns.filter(([, pattern]) => pattern.test(textValue)).map(([category]) => category);
      }
    }, options);
  }

  async getState(): Promise<RawBrowserState> {
    return readPlaywrightState(this.page);
  }

  async screenshot(options: ScreenshotOptions = {}): Promise<Buffer> {
    return this.page.screenshot({
      fullPage: options.fullPage,
      path: options.path
    });
  }

  async close(): Promise<void> {
    await this.page.close();
  }

  private async waitForUsefulPageContent(): Promise<void> {
    await this.page.waitForLoadState("load", { timeout: PAGE_LOAD_TIMEOUT_MS }).catch(() => undefined);
    await this.page
      .locator("body")
      .waitFor({ state: "visible", timeout: CONTENT_READY_TIMEOUT_MS })
      .catch(() => undefined);
    await this.page
      .waitForFunction(() => (document.body?.innerText ?? "").trim().length > 0, undefined, {
        timeout: CONTENT_READY_TIMEOUT_MS
      })
      .catch(() => undefined);
  }
}

export function playwrightAdapter(config?: PlaywrightAdapterConfig): BrowserAdapter {
  return new PlaywrightBrowserAdapter(config);
}
