# @statepilot/cli

StatePilot CLI, MCP server, browser setup, agent installers, doctor checks, and smoke tests.

## Install

```bash
npm install -g @statepilot/cli
```

## Setup

```bash
statepilot setup --target=all --location=global
```

This installs the Playwright Chromium browser StatePilot needs and writes MCP config for Claude Code, Codex CLI, Cursor, and opencode.

Restart the agent after setup.

## Commands

```bash
statepilot doctor
statepilot doctor --fix
statepilot install --target=claude --location=global
statepilot init . --install --target=claude,cursor,codex,opencode
statepilot smoke run
statepilot smoke prompt --target=claude
statepilot serve --mcp
```

See the repository README for the full runtime, architecture, and publishing guide.
