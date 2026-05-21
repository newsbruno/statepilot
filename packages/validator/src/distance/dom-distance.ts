import type { BrowserState, ExpectedState } from "@statepilot/browser-state";

export function calculateDomDistance(expected: ExpectedState, actual: BrowserState): number {
  if (expected.stateId) {
    return expected.stateId === actual.id ? 0 : 1;
  }

  if (!expected.domHash) {
    return 0;
  }

  return expected.domHash === actual.domHash ? 0 : 1;
}
