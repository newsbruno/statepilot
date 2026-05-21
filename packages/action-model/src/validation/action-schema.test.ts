import { describe, expect, it } from "vitest";
import { maskAction } from "../actions/agent-action";
import { AgentActionSchema, parseAgentAction } from "./action-schema";

describe("AgentActionSchema", () => {
  it("accepts a valid navigate action", () => {
    expect(
      AgentActionSchema.parse({
        type: "navigate",
        url: "https://example.com/login"
      })
    ).toEqual({
      type: "navigate",
      url: "https://example.com/login"
    });
  });

  it("rejects an empty selector", () => {
    expect(() =>
      parseAgentAction({
        type: "click",
        selector: ""
      })
    ).toThrow();
  });

  it("masks sensitive fill values", () => {
    expect(
      maskAction({
        type: "fill",
        selector: "#password",
        value: "secret",
        sensitive: true
      })
    ).toMatchObject({ value: "********" });
  });
});
