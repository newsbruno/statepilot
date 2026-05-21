import { createRuntime } from "@statepilot/core";
import { createMockBrowserAdapter, createMockPredictionEngine } from "@statepilot/testing";

export async function runBasicLoginExample() {
  const runtime = createRuntime({
    adapter: createMockBrowserAdapter(),
    predictor: createMockPredictionEngine([
      { type: "navigate", url: "https://example.com/login" },
      { type: "fill", selector: "#email", value: "person@example.com" },
      { type: "fill", selector: "#password", value: "secret", sensitive: true },
      { type: "click", selector: "button[type='submit']" },
      { type: "extract", schema: { message: "string" }, source: "text" }
    ]),
    maxActions: 6
  });

  return runtime.run<{ email: string; password: string }, { text: string }>({
    id: "example-basic-login",
    goal: "Login and extract confirmation text",
    siteKey: "example",
    input: {
      email: "person@example.com",
      password: "secret"
    },
    priority: "normal",
    timeoutMs: 30_000,
    retryLimit: 0,
    createdAt: new Date()
  });
}
