# Roadmap

StatePilot is usable as a local predictive browser runtime today. The next work is about making it feel effortless for real AI agents, then making it robust at scale.

## Done

- Core contracts, state encoding, action model, validator, predictor, memory, Playwright adapter, and tests.
- MCP tools for status, project initialization, single browser tasks, agent instructions, and consolidated site research.
- Agent integration scaffolding for Claude Code, Cursor, Codex CLI, and opencode.
- Article extraction mode with structured fields, claims, paragraph evidence, citations, and compact agent-friendly research output.
- Runtime protections for extraction tasks: URL inference, useful-content waits, hidden/offscreen click filtering, stale transition avoidance, and Playwright browser install diagnostics.
- Real-agent smoke prompts and a deterministic `statepilot smoke run` baseline for Claude Code, Cursor, Codex CLI, and opencode.
- Real-agent smoke result recording through `statepilot smoke record` and `statepilot smoke matrix`.
- First-run browser repair through `statepilot doctor --fix`.
- Agent MCP config validation through `statepilot doctor --target=... --location=...`.
- Total `statepilot_research_site` response budgeting through `maxResponseBytes` and returned budget metadata.

## Next

1. Real-agent verification matrix
   - Run the printed smoke prompts inside Claude Code, Codex CLI, Cursor, and opencode.
   - Record pass/fail evidence for each target using `statepilot smoke record`.

2. Install and configuration polish
   - Improve error messages for missing browser binaries, blocked launches, and invalid agent configuration.
   - Provide one copy-paste command for local development and one for package users.

3. Research workflow hardening
   - Add domain presets for common content sites: news articles, docs, changelogs, pricing pages, and app dashboards.
   - Add failure reasons for blocked pages, consent walls, navigation loops, and empty extraction.

4. Recorder and replay
   - Record validated browser flows from successful tasks.
   - Store transitions with selectors, screenshots, state hashes, and confidence scores.
   - Replay known flows before falling back to generic extraction or semantic matching.

5. Hybrid prediction and recovery
   - Add semantic transition matching.
   - Add recovery policies for stale selectors, hidden elements, slow pages, and changed layouts.
   - Add optional LLM fallback with strict evidence and action budgets.

6. Concurrency and operations
   - Add scheduler, worker queue, browser pool, retries, backpressure, and load tests.
   - Expose per-task traces, screenshots, network timing, and recovery events.

7. Studio
   - Build a small operational UI for tasks, learned flows, timelines, state comparisons, memory inspection, and failed extraction review.
