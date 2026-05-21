import type { BrowserState, RawBrowserState } from "@statepilot/browser-state";

export function mockRawBrowserState(overrides: Partial<RawBrowserState> = {}): RawBrowserState {
  return {
    url: "about:blank",
    title: "Blank",
    domSnapshot: "",
    visibleText: "",
    interactiveElements: [],
    viewport: { width: 1280, height: 720 },
    capturedAt: new Date("2026-05-20T00:00:00.000Z"),
    ...overrides
  };
}

export function mockBrowserState(overrides: Partial<BrowserState> = {}): BrowserState {
  return {
    id: "state-1",
    url: "about:blank",
    title: "Blank",
    urlHash: "url-hash",
    domHash: "dom-hash",
    visibleTextHash: "text-hash",
    interactiveElements: [],
    viewport: { width: 1280, height: 720 },
    createdAt: new Date("2026-05-20T00:00:00.000Z"),
    ...overrides
  };
}
