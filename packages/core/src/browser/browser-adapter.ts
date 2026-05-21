import type { AgentAction, WaitCondition } from "@statepilot/action-model";
import type { RawBrowserState } from "@statepilot/browser-state";

export interface BrowserSessionConfig {
  readonly headless?: boolean;
  readonly viewport?: {
    readonly width: number;
    readonly height: number;
  };
  readonly userAgent?: string;
}

export interface ScreenshotOptions {
  readonly fullPage?: boolean;
  readonly path?: string;
}

export interface ExtractedLink {
  readonly text: string;
  readonly url: string;
  readonly selector?: string;
  readonly title?: string;
  readonly rel?: string;
  readonly target?: string;
  readonly visible?: boolean;
  readonly internal?: boolean;
}

export interface ExtractionEvidence {
  readonly field: string;
  readonly value?: string;
  readonly source: "json_ld" | "meta" | "dom" | "url";
  readonly selector?: string;
  readonly snippet: string;
  readonly confidence?: number;
}

export interface ArticleParagraph {
  readonly index: number;
  readonly text: string;
  readonly selector?: string;
}

export interface ExtractedClaim {
  readonly text: string;
  readonly snippet: string;
  readonly selector?: string;
  readonly categories: readonly string[];
  readonly confidence: number;
}

export interface ExtractedArticle {
  readonly title?: string;
  readonly author?: string;
  readonly publishedAt?: string;
  readonly modifiedAt?: string;
  readonly description?: string;
  readonly image?: string;
  readonly section?: string;
  readonly tags: readonly string[];
  readonly paragraphs: readonly string[];
  readonly paragraphEvidence?: readonly ExtractionEvidence[];
  readonly paragraphDetails?: readonly ArticleParagraph[];
  readonly claims?: readonly ExtractedClaim[];
  readonly text: string;
  readonly evidence?: readonly ExtractionEvidence[];
}

export interface ExtractionOptions {
  readonly articleMode?: boolean;
  readonly includeEvidence?: boolean;
  readonly maxLinks?: number;
}

export interface PageMetadata {
  readonly title?: string;
  readonly description?: string;
  readonly canonicalUrl?: string;
  readonly language?: string;
}

export interface PageExtraction {
  readonly url: string;
  readonly title?: string;
  readonly text: string;
  readonly links: readonly ExtractedLink[];
  readonly metadata: PageMetadata;
  readonly article?: ExtractedArticle;
  readonly evidence?: readonly ExtractionEvidence[];
}

export interface BrowserAdapter {
  createSession(config?: BrowserSessionConfig): Promise<BrowserSession>;
}

export interface BrowserSession {
  readonly id: string;
  openPage(url?: string): Promise<BrowserPage>;
  close(): Promise<void>;
}

export interface BrowserPage {
  readonly id: string;
  goto(url: string): Promise<void>;
  click(selector: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  press(key: string): Promise<void>;
  waitFor(condition: WaitCondition): Promise<void>;
  extractText(): Promise<string>;
  extractPage(options?: ExtractionOptions): Promise<PageExtraction>;
  getState(): Promise<RawBrowserState>;
  screenshot(options?: ScreenshotOptions): Promise<Buffer>;
  close(): Promise<void>;
}

export type BrowserExecutableAction = Exclude<AgentAction, { type: "noop" }>;
