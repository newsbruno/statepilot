import type { BrowserState, ExpectedState } from "@statepilot/browser-state";

export function calculateElementDistance(expected: ExpectedState, actual: BrowserState): number {
  const requiredHashes = expected.requiredElementHashes ?? [];

  if (requiredHashes.length === 0) {
    return 0;
  }

  const actualHashes = new Set(actual.interactiveElements.map((element) => element.stableHash));
  const missingCount = requiredHashes.filter((hash) => !actualHashes.has(hash)).length;

  return missingCount / requiredHashes.length;
}
