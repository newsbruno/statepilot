import type { BrowserState, ExpectedState } from "@statepilot/browser-state";

export function calculateTextDistance(expected: ExpectedState, actual: BrowserState): number {
  if (expected.visibleTextHash && expected.visibleTextHash !== actual.visibleTextHash) {
    return 1;
  }

  if (expected.requiredText?.length) {
    return expected.requiredText.every((text) => actual.title?.toLowerCase().includes(text.toLowerCase())) ? 0 : 0.5;
  }

  return 0;
}
