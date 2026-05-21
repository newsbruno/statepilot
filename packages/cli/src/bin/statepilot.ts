#!/usr/bin/env node
import { runCli } from "../cli/main";

runCli().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
