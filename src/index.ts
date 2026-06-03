#!/usr/bin/env bun

import { runCli } from "./cli/program";

if (process.argv.slice(2).length === 0) {
  const { runTui } = await import("./tui/run-tui");
  await runTui();
} else {
  await runCli();
}
