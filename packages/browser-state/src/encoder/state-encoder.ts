import type { BrowserState } from "../types/browser-state";
import type { RawBrowserState } from "../types/raw-browser-state";

export interface StateEncoder {
  encode(rawState: RawBrowserState): Promise<BrowserState>;
}
