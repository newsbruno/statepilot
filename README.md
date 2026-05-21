# StatePilot

### A predictable browser runtime for AI agents

<p align="center">
  <img alt="npm v0.1.0" src="https://img.shields.io/badge/npm-v0.1.0-CB6D30?style=flat&labelColor=555555" />
  <img alt="License MIT" src="https://img.shields.io/badge/License-MIT-C9B900?style=flat&labelColor=555555" />
  <img alt="Node.js 18+" src="https://img.shields.io/badge/Node.js-18%2B-8CC84B?style=flat&labelColor=555555" />
  <br />
  <img alt="Windows supported" src="https://img.shields.io/badge/Windows-supported-0078D4?style=flat&labelColor=555555" />
  <img alt="macOS supported" src="https://img.shields.io/badge/macOS-supported-0078D4?style=flat&labelColor=555555" />
  <img alt="Linux supported" src="https://img.shields.io/badge/Linux-supported-0078D4?style=flat&labelColor=555555" />
  <br />
  <img alt="Claude Code supported" src="https://img.shields.io/badge/Claude%20Code-supported-7D2AE8?style=flat&labelColor=555555" />
  <img alt="Cursor supported" src="https://img.shields.io/badge/Cursor-supported-7D2AE8?style=flat&labelColor=555555" />
  <img alt="Codex CLI supported" src="https://img.shields.io/badge/Codex%20CLI-supported-7D2AE8?style=flat&labelColor=555555" />
  <img alt="opencode supported" src="https://img.shields.io/badge/opencode-supported-7D2AE8?style=flat&labelColor=555555" />
</p>

StatePilot gives AI agents a browser runtime with memory, validation, recovery, and agent-native integration.

It is designed for Claude Code, Codex CLI, Cursor, opencode, and custom agents that need to operate real websites without treating every click as a fresh reasoning problem.

```txt
Observe -> Predict -> Execute -> Validate -> Learn -> Recover
```

## Executive Summary

Modern AI agents are powerful at reasoning, but browser automation punishes pure reasoning loops. A typical agent sees a page, asks an LLM what to do, clicks, waits, observes again, asks again, and repeats. That works for demos. It becomes slow, expensive, and fragile for repeated workflows.

StatePilot takes a different approach.

Instead of making the model think from zero on every step, StatePilot turns browser work into a predictable runtime:

- observe a compact representation of the browser state;
- predict the next action from memory and heuristics;
- execute the action through a browser adapter;
- validate the actual next state against the expected next state;
- learn successful transitions;
- recover or escalate when reality diverges.

The product value is simple:

> Supercharge Claude Code, Codex CLI, Cursor, opencode, and custom AI agents with predictable browser automation that can be replayed, validated, audited, and improved over time.

## Why This Exists

Browser agents often fail for the same reasons:

- they overuse LLM calls for routine steps;
- they click stale, hidden, or irrelevant elements;
- they lose track of whether an action actually changed the page correctly;
- they rely on raw page text or screenshots when a compact state would be enough;
- they make every new run expensive, even when the flow is already known;
- they force the agent to glue together tool output with shell scripts or ad hoc parsing.

StatePilot exists to make repeated browser work feel like runtime execution, not improvisation.

It is especially useful for:

- portal login and search workflows;
- article and research extraction;
- form submission;
- table and document retrieval;
- repeated SaaS/admin tasks;
- agent smoke tests across Claude Code, Codex CLI, Cursor, and opencode;
- custom browser workers that need predictable state transitions.

## The Runtime Model

StatePilot is inspired by JEPA-style prediction: predict future representations, not raw pixels.

In browser terms, the runtime asks:

```txt
compact BrowserState + candidate Action -> expected next BrowserState
```

Then it compares:

```txt
expected next state vs actual next state
```

If the difference is small, the runtime continues and can store the transition as useful memory.

If the difference is large, StatePilot treats that as divergence. It can retry, choose another prediction, use heuristics, report the failure, or escalate to a heavier planner.

This gives agents a practical kind of predictability:

- known states can map to known actions;
- every action has an expected result;
- failures have structured reasons;
- repeated flows get cheaper and more reliable;
- LLM reasoning is reserved for ambiguity, not routine clicks.

## Architecture

StatePilot is split into small packages so the runtime stays testable and adapters stay replaceable.

| Package | Role |
| --- | --- |
| `@statepilot/action-model` | Serializable browser actions and validation |
| `@statepilot/browser-state` | Compact browser-state encoding and deterministic hashes |
| `@statepilot/predictor` | Hybrid prediction from memory and heuristics |
| `@statepilot/validator` | Energy-style validation of expected vs actual state |
| `@statepilot/memory` | In-memory and SQLite transition memory |
| `@statepilot/core` | Runtime orchestration and adapter contracts |
| `@statepilot/playwright` | Playwright browser adapter |
| `@statepilot/testing` | Deterministic mock adapter and test utilities |
| `@statepilot/cli` | CLI, MCP server, installers, doctor, and smoke tests |

The runtime loop is intentionally adapter-based:

```txt
Agent or App
  |
  v
StatePilot CLI / MCP / TypeScript API
  |
  v
Core Runtime
  |
  +-- Browser State Encoder
  +-- Prediction Engine
  +-- Validation Engine
  +-- Transition Memory
  |
  v
Browser Adapter
  |
  v
Playwright, mock adapter, or future adapters
```

## Install

Install the CLI globally:

```bash
npm install -g @statepilot/cli
```

Then run setup:

```bash
statepilot setup --target=all --location=global
```

`setup` does two things:

- installs the Playwright Chromium browser StatePilot needs for real browser tasks;
- writes MCP config and instruction files for the selected agent targets.

Restart the agent after setup so it reloads the MCP server.

To install only in the current project:

```bash
statepilot init . --install --target=claude,cursor,codex,opencode
```

To check the installation:

```bash
statepilot doctor
statepilot doctor --fix
statepilot doctor --location=all
```

`doctor --fix` repairs the most common first-run issue: missing Playwright Chromium.

## Agent Integration

StatePilot exposes a stdio MCP server:

```bash
statepilot serve --mcp
```

The installer writes each agent's native config so agents can call StatePilot as tools.

| Agent | Config | Instructions |
| --- | --- | --- |
| Claude Code | `.claude.json` or `~/.claude.json` | `CLAUDE.md` or `~/.claude/CLAUDE.md` |
| Cursor | `.cursor/mcp.json` or `~/.cursor/mcp.json` | `.cursor/rules/statepilot.mdc` |
| Codex CLI | `.codex/config.toml` or `~/.codex/config.toml` | `AGENTS.md` or `~/.codex/AGENTS.md` |
| opencode | `.opencode/opencode.jsonc` or opencode config dir | `AGENTS.md` |

Useful commands:

```bash
statepilot install --target=claude --location=global
statepilot install --target=codex --location=local
statepilot install --print-config cursor
statepilot doctor --target=all --location=all
```

## MCP Tools

StatePilot currently exposes these MCP tools:

| Tool | Purpose |
| --- | --- |
| `statepilot_status` | Check project/runtime status |
| `statepilot_init_project` | Create `.statepilot/config.json` |
| `statepilot_run_task` | Run a browser task through the StatePilot runtime |
| `statepilot_research_site` | Open an index page, collect links, select article URLs, extract articles, and return consolidated JSON |
| `statepilot_agent_instructions` | Return guidance for agents using StatePilot |

Agents should prefer `statepilot_research_site` for multi-page research. It prevents the agent from needing shell, Python, `cat`, `jq`, or saved tool-result files to merge outputs.

## Basic Browser Task

For a simple page extraction:

```json
{
  "goal": "Open https://techcrunch.com/ and extract page text",
  "headless": true,
  "timeoutMs": 60000
}
```

StatePilot infers the URL from the goal and adds an extraction step. A healthy run returns:

- `result.url`;
- `result.title`;
- `result.text`;
- `result.links`;
- `result.metadata`;
- metrics such as action count, duration, recovery count, and prediction confidence.

You can also pass structured input:

```json
{
  "goal": "Open TechCrunch and extract page text",
  "input": {
    "url": "https://techcrunch.com/"
  },
  "extractText": true,
  "headless": true,
  "timeoutMs": 60000
}
```

If a run only navigates and returns `result: null`, ask with explicit extraction language such as “extract page text” or “collect article links”, then restart the agent if it has an old MCP server loaded.

## Article Extraction

For article pages, use article mode:

```json
{
  "goal": "Open the article URL and extract title, author, date, body, claims, and evidence",
  "input": {
    "url": "https://example.com/2026/05/20/article/"
  },
  "articleMode": true,
  "includeEvidence": true,
  "headless": true,
  "timeoutMs": 60000
}
```

Article mode extracts deterministic fields from:

- JSON-LD;
- meta tags;
- `article` and `main` DOM content;
- paragraph evidence;
- field-level evidence;
- claim candidates.

Agents should build summaries and structured output from `result.article`, especially:

- `result.article.title`;
- `result.article.author`;
- `result.article.publishedAt`;
- `result.article.description`;
- `result.article.claims`;
- `result.article.paragraphEvidence`;
- `result.article.evidence`.

## Multi-Article Research

For research workflows, use the consolidated research tool:

```json
{
  "url": "https://techcrunch.com/category/artificial-intelligence/",
  "topic": "AI startup news",
  "limit": 5,
  "includeEvidence": true,
  "responseMode": "compact",
  "maxClaimsPerArticle": 4,
  "maxCitationsPerArticle": 4,
  "maxSnippetChars": 320,
  "maxResponseBytes": 60000,
  "headless": true,
  "timeoutMs": 60000
}
```

The workflow:

1. Opens the source page.
2. Extracts normalized links.
3. Scores links against the topic.
4. Selects article URLs.
5. Opens each selected article.
6. Extracts article fields, claims, citations, and evidence.
7. Returns one JSON object with `articles`, `failures`, `metrics`, and `budget`.

This is the recommended path for agent research because the agent receives one structured result instead of many large tool-result files.

Use `responseMode: "compact"` by default. Use `responseMode: "full"` only for raw article payloads.

`maxResponseBytes` caps the serialized response and reports reductions in `budget.reductions`.

## Real-Agent Smoke Tests

StatePilot includes a smoke-test workflow for validating real agent integrations.

Run the deterministic baseline:

```bash
statepilot smoke run
```

Print prompts for real agents:

```bash
statepilot smoke prompt --target=claude
statepilot smoke prompt --target=codex
statepilot smoke prompt --target=cursor
statepilot smoke prompt --target=opencode
```

The generated prompt asks the agent to call `statepilot_research_site` with `smokeMode: true`.

`smokeMode` still runs the full index-to-article workflow, but returns a compact verification payload:

- links collected;
- links selected;
- article count;
- URL/title/author/date checks;
- claims present;
- citations present;
- failures;
- metrics;
- response budget;
- pass/fail checks.

This makes real-agent testing much less fragile. The agent does not need to echo huge claim and citation text back into the final answer.

Record real-agent results:

```bash
statepilot smoke record --target=claude --status=pass --response-bytes=4532 --articles=5 --selected-links=5 --failures=0 --used-shell=false --read-tool-results=false --notes="Real Claude Code MCP run passed with smokeMode true."
statepilot smoke matrix
```

The matrix is stored at `.statepilot/smoke-matrix.json`.

## Testing and Verification

For contributors:

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm smoke
```

Recommended pre-release check:

```bash
pnpm check
pnpm build
pnpm smoke
```

`pnpm smoke` uses the mock adapter, so it does not require network access.

For real browser testing, run:

```bash
statepilot smoke run --real
```

## TypeScript API

StatePilot can also be used directly as a TypeScript runtime:

```ts
import { createRuntime } from "@statepilot/core";
import { createInMemoryPredictionMemory } from "@statepilot/memory";
import { createMockBrowserAdapter } from "@statepilot/testing";

const runtime = createRuntime({
  adapter: createMockBrowserAdapter(),
  memory: createInMemoryPredictionMemory()
});

await runtime.run({
  id: crypto.randomUUID(),
  goal: "Open the login page",
  siteKey: "demo",
  input: {
    url: "https://example.com/login"
  },
  priority: "normal",
  timeoutMs: 30000,
  retryLimit: 1,
  createdAt: new Date()
});
```

Use the TypeScript API when embedding StatePilot inside a worker, service, or custom agent runtime.

Use the CLI/MCP path when Claude Code, Codex CLI, Cursor, or opencode should call StatePilot as a tool.

## Release Process

Public npm distribution is centered on the CLI package:

```bash
npm install -g @statepilot/cli
```

The CLI depends on internal `@statepilot/*` packages. A public release publishes the workspace packages first, then `@statepilot/cli`. An alternative release strategy is to bundle the internal runtime packages into the CLI package and publish only the CLI.

Release checklist:

1. Confirm the `@statepilot` npm organization/scope exists and the publishing account has access.
2. Add final package metadata: license, repository, homepage, keywords, and author.
3. Build the workspace.
4. Dry-run package publishing and inspect generated manifests.
5. Publish the internal packages in dependency order.
6. Publish `@statepilot/cli`.
7. Verify from a clean machine or temp directory with `npm install -g @statepilot/cli`.
8. Run `statepilot doctor --fix` and `statepilot smoke run`.

Package dependency order for the current workspace:

1. `@statepilot/action-model`
2. `@statepilot/browser-state`
3. `@statepilot/memory`
4. `@statepilot/validator`
5. `@statepilot/predictor`
6. `@statepilot/core`
7. `@statepilot/playwright`
8. `@statepilot/testing`
9. `@statepilot/cli`

The root package is private and should not be published.

Useful release checks:

```bash
pnpm build
pnpm check
pnpm smoke
pnpm publish -r --dry-run
```

Publish command:

```bash
pnpm publish -r --access public
```

Before publishing, inspect the packed `package.json` files and confirm that no published package contains unresolved `workspace:*` or `catalog:` dependency ranges.

## Troubleshooting

npm publish returns `404 Scope not found`:

The `@statepilot` scope must exist on npm before scoped packages can be published. Create the `statepilot` npm organization, grant publish access to the release account, then rerun `pnpm publish -r --access public`. If the scope is not available, rename package scopes consistently before publishing.

Missing Playwright browser:

```bash
statepilot doctor --fix
```

Agent cannot see StatePilot tools:

```bash
statepilot doctor --location=all
```

Then restart the agent.

Research result too large:

- use `responseMode: "compact"`;
- lower `limit`;
- lower `maxClaimsPerArticle`;
- lower `maxCitationsPerArticle`;
- lower `maxSnippetChars`;
- set `smokeMode: true` for integration tests.

Agent tries to read saved tool-result files:

- use `statepilot_research_site` instead of multiple `statepilot_run_task` calls;
- use the generated prompt from `statepilot smoke prompt`;
- keep `maxResponseBytes` small enough for inline output.

## Current Status

StatePilot currently includes:

- core runtime orchestration;
- serializable action model;
- compact browser-state encoder;
- hybrid prediction engine;
- energy-style validator;
- in-memory and SQLite transition memory;
- Playwright adapter;
- deterministic mock adapter;
- MCP server;
- agent installers;
- doctor and browser repair commands;
- consolidated research workflow;
- real-agent smoke prompt and result matrix.

The architecture note that started the project is in [statepilot-architecture.md](./statepilot-architecture.md).
