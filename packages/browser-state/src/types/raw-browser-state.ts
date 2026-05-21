import type { BoundingBox, ElementRole } from "./element-signature";
import type { ViewportInfo } from "./browser-state";

export interface RawInteractiveElement {
  readonly role: ElementRole;
  readonly text?: string;
  readonly ariaLabel?: string;
  readonly placeholder?: string;
  readonly name?: string;
  readonly selector: string;
  readonly stableSelector?: string;
  readonly bbox?: BoundingBox;
  readonly visible?: boolean;
  readonly enabled?: boolean;
}

export interface RawBrowserState {
  readonly url: string;
  readonly title?: string;
  readonly domSnapshot?: string;
  readonly visibleText?: string;
  readonly semanticText?: string;
  readonly interactiveElements?: readonly RawInteractiveElement[];
  readonly viewport?: ViewportInfo;
  readonly capturedAt?: Date;
}
