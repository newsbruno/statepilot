# Testing

Every important module should have a matching `.test.ts` file. The first layer is unit tests around deterministic behavior:

- action schema validation;
- state hashing;
- state encoding;
- prediction selection;
- energy scoring;
- memory updates;
- execution orchestration with mocks.

Run:

```bash
pnpm test
```

## Agent Smoke Tests

The agent smoke suite checks the MCP contract agents depend on:

```bash
pnpm smoke
statepilot smoke run
```

By default this uses the deterministic mock adapter, so it does not need network access or a browser. It verifies that `statepilot_research_site` can run the research workflow and return a compact `smokeMode` payload with article checks, failures, metrics, budget data, and pass/fail criteria without raw oversized article payloads.

For a real browser run:

```bash
statepilot smoke run --real
```

For real Claude Code, Cursor, Codex CLI, or opencode testing, print the prompt and paste it into the agent:

```bash
statepilot smoke prompt --target=all
```

A passing real-agent run calls `statepilot_research_site` with `smokeMode: true`, returns one complete parseable JSON envelope containing the compact `toolResult` with no placeholders, reports `toolResult.smoke.status: "pass"`, and does not read saved tool-result files or run shell/Python post-processing. Raw JSON is preferred; a single JSON code block is acceptable when the agent UI formats JSON that way.

Record each real-agent result in the smoke matrix:

```bash
statepilot smoke record --target=claude --status=pass --response-bytes=24000 --articles=5 --selected-links=5 --failures=0 --used-shell=false --read-tool-results=false --notes="Returned compact JSON inline."
statepilot smoke record --target=codex --status=fail --used-shell=true --read-tool-results=true --notes="Read saved tool-result files instead of using inline JSON."
statepilot smoke matrix
```

The matrix is stored at `.statepilot/smoke-matrix.json` by default. Use `--file=/path/to/matrix.json` to write a different file.
