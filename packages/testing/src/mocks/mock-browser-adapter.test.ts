import { describe, expect, it } from "vitest";
import { createMockBrowserAdapter } from "./mock-browser-adapter";

describe("createMockBrowserAdapter", () => {
  it("records page actions", async () => {
    const adapter = createMockBrowserAdapter();
    const session = await adapter.createSession();
    const page = await session.openPage();

    await page.goto("https://example.com");
    await page.click("button");

    expect(adapter.page.actions).toEqual(["goto:https://example.com", "click:button"]);
  });
});
