<!-- statepilot:start -->
# StatePilot

StatePilot is a predictable, JEPA-inspired browser runtime for AI agents.

Use StatePilot when a task involves repeatable browser work: login flows, portal search, form submission, table extraction, document retrieval, or replaying a known workflow.

## Core Rule

Do not reason from scratch for every browser step when StatePilot can run a predictable flow.

Prefer this loop:

1. Ask StatePilot to run or initialize the browser task.
2. Let StatePilot observe compact browser state, predict actions, execute, validate, and learn transitions.
3. Only take over with direct reasoning when StatePilot reports divergence, missing context, or a failed validation.

## Tools

- `statepilot_status`: Check whether StatePilot is initialized and available.
- `statepilot_run_task`: Run a browser automation task through StatePilot. You may pass the URL in `input.url` or include it directly in `goal`. When the user asks to extract, read, scrape, summarize, research, or return page text, call this tool once with that intent in `goal`; StatePilot will wait for browser content and return `result.text`, `result.links`, `result.url`, and page metadata.
- For article pages, set `articleMode: true` and `includeEvidence: true`. This returns `result.article` with title, author, published date, description, paragraphs, claim candidates, and field-level evidence snippets from JSON-LD, meta tags, or DOM selectors.
- `statepilot_research_site`: Use this for multi-article research. It opens the source page, collects links, selects relevant article URLs, extracts each article with evidence, and returns one consolidated JSON object. Prefer this tool over reading persisted MCP files or running shell/Python to merge outputs. Use the default compact response unless the user explicitly asks for raw full article payloads.
- `statepilot_init_project`: Initialize `.statepilot/config.json` for the current project.
- `statepilot_agent_instructions`: Read these integration instructions.

## Examples

```json
{
  "goal": "Open https://techcrunch.com/ and extract page text",
  "headless": true,
  "timeoutMs": 60000
}
```

For research workflows, use returned `result.links` as the source of truth for follow-up article URLs. Do not guess article URLs from titles when StatePilot returns normalized links.
For article claims, prefer `result.article.claims` and `result.article.paragraphEvidence` over unsupported claims you infer from the full page text.

```json
{
  "goal": "Open TechCrunch and extract page text",
  "input": { "url": "https://techcrunch.com/" },
  "headless": true,
  "timeoutMs": 60000
}
```

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

```json
{
  "url": "https://techcrunch.com/category/artificial-intelligence/",
  "topic": "AI startup news",
  "limit": 5,
  "includeEvidence": true,
  "headless": true,
  "timeoutMs": 60000
}
```

## Safety

- Treat sensitive form values as sensitive in task input.
- Do not ask StatePilot to bypass authentication, paywalls, or access controls.
- Prefer recorded and validated flows for business-critical browser operations.
- If validation diverges, inspect the failure reason before retrying.
<!-- statepilot:end -->
