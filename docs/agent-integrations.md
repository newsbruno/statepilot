# Agent Integrations

StatePilot follows the same integration shape used by local-first agent tools:

1. Ship a binary agents can launch.
2. Expose a stdio MCP server from that binary.
3. Provide an installer that writes each agent's native config file.
4. Add instruction files so agents know when to prefer StatePilot over direct browser reasoning.

## Commands

```bash
npm install -g @statepilot/cli
statepilot setup --target=all --location=global
statepilot init . --install --target=claude,cursor,codex,opencode
statepilot install --print-config codex
statepilot doctor
statepilot doctor --fix
statepilot doctor --location=global
statepilot doctor --location=all
statepilot smoke run
statepilot smoke prompt --target=all
statepilot smoke matrix
statepilot serve --mcp
```

## Config Files Written

| Target | Config | Instructions |
| --- | --- | --- |
| Claude Code | `.claude.json` or `~/.claude.json`; optional `.claude/settings.json` allow list | `CLAUDE.md` or `~/.claude/CLAUDE.md` |
| Cursor | `.cursor/mcp.json` or `~/.cursor/mcp.json` | `.cursor/rules/statepilot.mdc` |
| Codex CLI | `.codex/config.toml` or `~/.codex/config.toml` | `AGENTS.md` or `~/.codex/AGENTS.md` |
| opencode | `.opencode/opencode.jsonc` or `~/.config/opencode/opencode.jsonc` | `.opencode/AGENTS.md` or `~/.config/opencode/AGENTS.md` |

## Doctor

`statepilot doctor` checks browser availability and validates each agent MCP config. By default it checks local project files. Use `--location=global` after global setup, or `--location=all` when debugging both scopes:

```bash
statepilot doctor --target=all --location=local
statepilot doctor --target=claude --location=global
statepilot doctor --target=codex --location=all
```

For missing or invalid agent config, doctor prints the exact install command to repair that target.

## MCP Tools

- `statepilot_status`
- `statepilot_init_project`
- `statepilot_run_task`
- `statepilot_research_site`
- `statepilot_agent_instructions`

## Real-Agent Smoke Test

Run the deterministic baseline first:

```bash
statepilot smoke run
```

This calls `statepilot_research_site` with the mock adapter and `smokeMode: true`. It checks that the real research workflow is usable by agents while returning a small verification shape: success status, compact response mode, article checks, citations/claims present flags, no failures, metrics, and no raw oversized article payload.

Then print the prompt for a specific agent:

```bash
statepilot smoke prompt --target=claude
statepilot smoke prompt --target=codex
statepilot smoke prompt --target=cursor
statepilot smoke prompt --target=opencode
```

Paste the prompt into the agent after restarting it so it reloads the MCP server. A passing real-agent run must call `statepilot_research_site`, return one complete parseable JSON envelope containing the compact `toolResult` with no placeholders, report `toolResult.smoke.status: "pass"`, and avoid shell/Python/tool-result-file workarounds. Raw JSON is preferred; a single JSON code block is acceptable when the agent UI formats JSON that way.

Record the result:

```bash
statepilot smoke record --target=claude --status=pass --response-bytes=24000 --articles=5 --selected-links=5 --failures=0 --used-shell=false --read-tool-results=false --notes="Returned compact JSON inline."
statepilot smoke matrix
```

The smoke matrix compares Claude Code, Cursor, Codex CLI, and opencode with the same prompt and pass criteria.

Use `statepilot_research_site` for multi-article research instead of manually reading persisted MCP output files or running shell/Python to merge them:

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

It returns selected links, extracted article fields, claim candidates, citations, failures, and metrics in one JSON object. The default `compact` response avoids oversized MCP outputs, and `maxResponseBytes` caps the whole serialized JSON result. If StatePilot must trim output, it reports the reductions in `budget.reductions`; use `responseMode: "full"` only for raw article payloads.

For smoke prompts and CI checks, add `smokeMode: true`. The tool still opens the index, collects links, extracts articles, and checks evidence, but returns compact booleans and counts instead of long claim/citation text so real agents can reliably echo the result as valid JSON.

For page text, agents can call `statepilot_run_task` with a natural-language goal:

```json
{
  "goal": "Open https://techcrunch.com/ and extract page text",
  "headless": true,
  "timeoutMs": 60000
}
```

StatePilot infers the URL from the goal, waits for useful browser content, then returns `result.text`, `result.links`, `result.url`, and `result.metadata`. `input.url` and `extractText: true` can still be passed explicitly when structured arguments are preferred.

For research workflows, use `result.links` as the source of truth for follow-up article URLs. Do not guess URLs from article titles.

For article pages, use:

```json
{
  "goal": "Open the article URL and extract title, author, date, body, and evidence",
  "input": { "url": "https://example.com/2026/05/20/article/" },
  "articleMode": true,
  "includeEvidence": true,
  "headless": true,
  "timeoutMs": 60000
}
```

This returns `result.article` with deterministic article fields, claim candidates, paragraph evidence, and evidence snippets from JSON-LD, meta tags, or DOM selectors. Prefer `result.article.claims`, `result.article.paragraphEvidence`, and field evidence when writing summaries, briefings, or structured JSON.

A healthy extraction run should include `result.text`, normalized links, and usually `actionsCount: 2`. If an agent returns `result: null` with `actionsCount: 1`, it only navigated. Rebuild/restart the MCP server so the agent reloads the latest tool description, then include “extract page text” or “collect article links” in the goal.
