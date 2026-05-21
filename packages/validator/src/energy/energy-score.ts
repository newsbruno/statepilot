import type { AgentAction } from "@statepilot/action-model";
import type { BrowserState, ExpectedState } from "@statepilot/browser-state";
import { calculateDomDistance } from "../distance/dom-distance";
import { calculateElementDistance } from "../distance/element-distance";
import { calculateTextDistance } from "../distance/text-distance";
import { calculateUrlDistance } from "../distance/url-distance";

export interface EnergyScore {
  readonly urlDistance: number;
  readonly domDistance: number;
  readonly textDistance: number;
  readonly elementDistance: number;
  readonly semanticDistance?: number;
  readonly total: number;
}

export interface EnergyScoreInput {
  readonly previousState: BrowserState;
  readonly action: AgentAction;
  readonly expected?: ExpectedState;
  readonly actual: BrowserState;
}

export function calculateEnergyScore(input: EnergyScoreInput): EnergyScore {
  if (!input.expected) {
    return {
      urlDistance: 0,
      domDistance: 0,
      textDistance: 0,
      elementDistance: 0,
      total: 0
    };
  }

  const urlDistance = calculateUrlDistance(input.expected, input.actual);
  const domDistance = calculateDomDistance(input.expected, input.actual);
  const textDistance = calculateTextDistance(input.expected, input.actual);
  const elementDistance = calculateElementDistance(input.expected, input.actual);
  const semanticDistance = input.expected.semanticHash
    ? input.expected.semanticHash === input.actual.semanticHash
      ? 0
      : 1
    : undefined;

  const weightedTotal =
    urlDistance * 0.25 +
    domDistance * 0.25 +
    textDistance * 0.25 +
    elementDistance * 0.25;

  return {
    urlDistance,
    domDistance,
    textDistance,
    elementDistance,
    semanticDistance,
    total: clamp01(semanticDistance === undefined ? weightedTotal : weightedTotal * 0.85 + semanticDistance * 0.15)
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
