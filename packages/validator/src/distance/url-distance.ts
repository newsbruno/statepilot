import type { BrowserState, ExpectedState } from "@statepilot/browser-state";

export function calculateUrlDistance(expected: ExpectedState, actual: BrowserState): number {
  if (expected.urlHash) {
    return expected.urlHash === actual.urlHash ? 0 : 1;
  }

  if (expected.url) {
    return normalizeUrl(expected.url) === normalizeUrl(actual.url) ? 0 : 1;
  }

  return 0;
}

function normalizeUrl(value: string): string {
  return value.replace(/\/$/, "");
}
