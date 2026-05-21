import type { ElementSignature } from "./element-signature";

export interface ViewportInfo {
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor?: number;
}

export interface BrowserState {
  readonly id: string;
  readonly url: string;
  readonly title?: string;
  readonly urlHash: string;
  readonly domHash: string;
  readonly visibleTextHash: string;
  readonly semanticHash?: string;
  readonly interactiveElements: readonly ElementSignature[];
  readonly viewport: ViewportInfo;
  readonly createdAt: Date;
}

export interface ExpectedState {
  readonly stateId?: string;
  readonly url?: string;
  readonly urlHash?: string;
  readonly domHash?: string;
  readonly visibleTextHash?: string;
  readonly semanticHash?: string;
  readonly requiredElementHashes?: readonly string[];
  readonly requiredText?: readonly string[];
}
