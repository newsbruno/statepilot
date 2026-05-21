import { describe, expect, it } from "vitest";
import { PlaywrightBrowserAdapter, playwrightAdapter } from "./playwright-adapter";

describe("playwrightAdapter", () => {
  it("creates a Playwright adapter instance without launching a browser", () => {
    expect(playwrightAdapter({ headless: true })).toBeInstanceOf(PlaywrightBrowserAdapter);
  });
});
