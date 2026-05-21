import { createStateHash, createTextHash, normalizeText } from "../hash/state-hash";
import type { BrowserState } from "../types/browser-state";
import type { ElementSignature } from "../types/element-signature";
import type { RawBrowserState, RawInteractiveElement } from "../types/raw-browser-state";
import type { StateEncoder } from "./state-encoder";

export class DefaultStateEncoder implements StateEncoder {
  async encode(rawState: RawBrowserState): Promise<BrowserState> {
    const interactiveElements = (rawState.interactiveElements ?? []).map((element, index) =>
      encodeElement(element, index)
    );

    const urlHash = createTextHash(rawState.url);
    const domHash = createTextHash(rawState.domSnapshot);
    const visibleTextHash = createTextHash(rawState.visibleText);
    const semanticHash = rawState.semanticText ? createTextHash(rawState.semanticText) : undefined;

    return {
      id: createStateHash({
        urlHash,
        domHash,
        visibleTextHash,
        elements: interactiveElements.map((element) => element.stableHash)
      }),
      url: rawState.url,
      title: rawState.title,
      urlHash,
      domHash,
      visibleTextHash,
      semanticHash,
      interactiveElements,
      viewport: rawState.viewport ?? { width: 1280, height: 720 },
      createdAt: rawState.capturedAt ?? new Date()
    };
  }
}

export function createDefaultStateEncoder(): StateEncoder {
  return new DefaultStateEncoder();
}

function encodeElement(element: RawInteractiveElement, index: number): ElementSignature {
  const stableHash = createStateHash({
    role: element.role,
    text: normalizeText(element.text).toLowerCase(),
    ariaLabel: normalizeText(element.ariaLabel).toLowerCase(),
    placeholder: normalizeText(element.placeholder).toLowerCase(),
    name: normalizeText(element.name).toLowerCase(),
    selector: element.stableSelector ?? element.selector
  });

  return {
    id: `${element.role}:${index}:${stableHash.slice(0, 8)}`,
    role: element.role,
    text: element.text,
    ariaLabel: element.ariaLabel,
    placeholder: element.placeholder,
    name: element.name,
    selector: element.selector,
    stableSelector: element.stableSelector,
    bbox: element.bbox,
    visible: element.visible ?? true,
    enabled: element.enabled ?? true,
    stableHash
  };
}
