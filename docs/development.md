# Development

This project follows the architecture document's first rule: build the runtime that creates good data before building an intelligent model.

## Package Boundaries

- `@statepilot/core` owns orchestration and browser adapter contracts.
- `@statepilot/action-model` owns serializable, validated actions.
- `@statepilot/browser-state` owns compact state signatures and hashing.
- `@statepilot/predictor` chooses the next action from memory, rules, or fallbacks.
- `@statepilot/validator` compares expected and actual state.
- `@statepilot/memory` persists learned transitions.
- `@statepilot/playwright` adapts Playwright into the core browser contract.

Core must not import Playwright directly.
