import { describe, expect, it } from "vitest";
import { DefaultStateEncoder } from "./default-state-encoder";

describe("DefaultStateEncoder", () => {
  it("creates deterministic state hashes for equivalent raw state", async () => {
    const encoder = new DefaultStateEncoder();
    const rawState = {
      url: "https://example.com/login",
      title: "Login",
      domSnapshot: "<button>Entrar</button>",
      visibleText: "Entrar",
      interactiveElements: [
        {
          role: "button" as const,
          text: "Entrar",
          selector: "button"
        }
      ],
      capturedAt: new Date("2026-05-20T00:00:00.000Z")
    };

    const stateA = await encoder.encode(rawState);
    const stateB = await encoder.encode(rawState);

    expect(stateA.id).toBe(stateB.id);
    expect(stateA.interactiveElements[0]?.stableHash).toBe(stateB.interactiveElements[0]?.stableHash);
  });
});
