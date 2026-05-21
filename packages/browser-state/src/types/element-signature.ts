export type ElementRole =
  | "button"
  | "input"
  | "textarea"
  | "select"
  | "checkbox"
  | "radio"
  | "link"
  | "table"
  | "file"
  | "unknown";

export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ElementSignature {
  readonly id: string;
  readonly role: ElementRole;
  readonly text?: string;
  readonly ariaLabel?: string;
  readonly placeholder?: string;
  readonly name?: string;
  readonly selector: string;
  readonly stableSelector?: string;
  readonly bbox?: BoundingBox;
  readonly visible: boolean;
  readonly enabled: boolean;
  readonly stableHash: string;
}
