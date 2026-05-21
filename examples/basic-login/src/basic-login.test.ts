import { describe, expect, it } from "vitest";
import { runBasicLoginExample } from "./basic-login";

describe("basic login example", () => {
  it("runs a recorded login-shaped flow", async () => {
    const result = await runBasicLoginExample();

    expect(result.status).toBe("success");
    expect(result.metrics.actionsCount).toBe(5);
    expect(result.result?.text).toContain("Loaded https://example.com/login");
  });
});
