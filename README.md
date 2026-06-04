# Zenith CLI

Local-first project memory and agent coordination CLI for developers using AI coding agents.

This MVP stores private project memory locally, exposes stable JSON commands for agents, and provides a read-only OpenTUI dashboard for humans.

The public product name is Zenith CLI. The `decode` binary remains available as a compatibility alias while the command surface migrates to `zenith`.

## Status

Zenith is private and source-first for now. The supported development and dogfooding path is Bun from this checkout. npm publication and standalone binary distribution are intentionally deferred.

## Requirements

- Bun 1.x
- Git, when project detection should include repository context

## Install And Run From Source

Install dependencies:

```bash
bun install
```

Run Zenith from the checkout:

```bash
bun run zenith
bun run zenith --help
bun run zenith project detect --json
```

Running `bun run zenith` with no arguments launches the read-only OpenTUI workspace. Use `↑`/`↓` to navigate within the current region, `enter` to move focus forward (sidebar → content, and between columns inside the Roadmap workspace), `backspace` (or `←`) to move focus backward, number keys `1–8` to jump directly to a section, `r` to refresh, and `q` or `esc` to quit. JSON commands remain available by passing command arguments.

Register the current project when needed:

```bash
bun run zenith init --json
```

If a `zenith` binary is already available on `PATH`, the same commands work without `bun run`:

```bash
zenith project detect --json
zenith context compact --json
```

## Build Output

Build the bundled JavaScript entrypoint:

```bash
bun run build
bun dist/index.js project detect --json
```

The bundled JS entrypoint is a verified way to run built output.

Build the local headless executable:

```bash
bun run compile
./dist/zenith --help
./dist/zenith project detect --json
```

The `dist/zenith` entrypoint is a Bun executable script, not a standalone binary. It is headless: it supports CLI commands and JSON smoke tests, but it does not launch the OpenTUI dashboard when run without arguments. Use `bun run zenith` from the source checkout for the dashboard. The source checkout remains the supported dogfooding path, and npm publication plus standalone binary distribution are still deferred.

## Storage

Zenith stores private project memory in a local SQLite database. New installs use `~/.zenith/zenith.db` by default.

Storage home precedence:

1. `ZENITH_HOME`
2. `DECODE_HOME` legacy fallback
3. `~/.decode` when that legacy directory already exists
4. `~/.zenith`

When Zenith uses the legacy `~/.decode` home, it keeps the legacy database name `decode.db`. All other homes use `zenith.db`.

SQLite enforces core integrity such as foreign keys, status guards, active-plan per-roadmap uniqueness (one active plan per roadmap, plus one standalone), worktree-to-roadmap focus bindings, and source links for roadmap-derived plans. See [`docs/storage-policy.md`](docs/storage-policy.md) for the normalization policy behind embedded JSON arrays.

## Memory Types

- `brief`: stable project intent and why the project exists.
- `roadmap`: long-running product or technical direction.
- `plan`: executable phased work being done now.
- `spike`: bounded investigation to reduce uncertainty.
- `decision`: technical or strategic choice.
- `finding`: bug, risk, debt, or gap.
- `session`: work continuity log.

Use `plan` only for executable work. Store non-executable project memory with `brief`, `roadmap`, or `spike`.

## MVP Commands

Project:

```bash
bun run zenith init --json
bun run zenith project detect --json
bun run zenith project status --json
```

Plans and phases:

```bash
bun run zenith plan create --json --input -
bun run zenith plan list --json
bun run zenith plan show <plan-id> --json
bun run zenith plan update <plan-id> --json --input -
bun run zenith plan update-phase <plan-id> --json --input -
bun run zenith plan next --json
bun run zenith plan next --json --stale-after-days 7
bun run zenith phase show <phase-id> --json
```

`plan update-phase` input accepts optional `dependsOn` (array of phase ids) to declare phase prerequisites. `plan next` skips phases whose dependencies are not yet `done` and returns a recommendation prefixed `Blocked by dependency:` (with a `blockedBy` array) when all remaining todo phases are gated. `--stale-after-days <n>` adds `staleness` metadata to the next-step JSON without changing the default response shape.

Context:

```bash
bun run zenith context get --json
bun run zenith context compact --json
bun run zenith resume --json
bun run zenith timeline --json
bun run zenith standup --json
bun run zenith diff --json
bun run zenith diff --json --since <event-id-or-iso>
bun run zenith drift --json
bun run zenith adherence --json
```

`zenith timeline` is a read-only activity log; accepts `--limit <n>` and `--since <eventId|iso>`. Self-tracking telemetry commands are also read-only: `standup` gives a daily digest, `diff` shows changes since a cursor or the latest ended session, `drift` compares roadmap and active plan alignment, and `adherence` reports event-derived velocity.

Long-running memory:

```bash
bun run zenith brief set --json --input -
bun run zenith brief show --json
bun run zenith roadmap create --json --input -
bun run zenith roadmap list --json
bun run zenith roadmap workspace --json
bun run zenith roadmap add-item <roadmap-id> --json --input -
bun run zenith roadmap update-item <roadmap-id> --json --input -
bun run zenith roadmap create-plan <roadmap-id> --json --input -
bun run zenith spike create --json --input -
bun run zenith spike conclude <spike-id> --json --input -
```

Roadmap focus (bind a worktree/branch to the roadmap it is implementing):

```bash
bun run zenith focus show --json
bun run zenith focus set <roadmap-id> --json
bun run zenith focus clear --json
```

Operational memory:

```bash
bun run zenith decision record --json --input -
bun run zenith decision list --json
bun run zenith finding record --json --input -
bun run zenith finding list --json
bun run zenith finding list --status all --json
bun run zenith finding show <finding-id> --json
bun run zenith finding update <finding-id> --json --input -
bun run zenith finding close <finding-id> --json
```

`finding record` and `finding update` JSON input accept optional `relatedPlanId` and `relatedPhaseId` to link a finding to an active plan or phase.

```bash
bun run zenith session start --json --input -
bun run zenith session list --json
bun run zenith session show <session-id> --json
bun run zenith session capture <session-id> --json --input -
bun run zenith session end <session-id> --json --input -
```

Agent pack:

```bash
bun run zenith agents install codex --json
bun run zenith agents install claude --json
```

## Agent Workflow

Use Zenith as the source of truth before planning or continuing work:

```bash
zenith context compact --json
zenith plan next --json
zenith timeline --json
zenith standup --json
```

`zenith timeline` shows recent project activity (read-only event log); accepts `--limit <n>` and `--since <eventId|iso>`. Use `zenith standup --json`, `zenith diff --json`, `zenith drift --json`, and `zenith adherence --json` when you need read-only self-tracking telemetry before choosing the next work.

When working from this source checkout and the `zenith` binary is not on `PATH`, use `bun run zenith ...` for the same commands.

If `plan next` returns a `planId` and `phaseId`, inspect the phase before implementing:

```bash
zenith phase show <phase-id> --json
```

Plan metadata can be updated without touching SQLite directly:

```bash
zenith plan update <plan-id> --json --input -
```

Payload:

```json
{
  "title": "Plan title",
  "description": "Short purpose",
  "status": "active",
  "priority": "high"
}
```

Roadmaps and spikes have separate commands:

```bash
zenith brief set --json --input -
zenith roadmap create --json --input -
zenith roadmap add-item <roadmap-id> --json --input -
zenith roadmap create-plan <roadmap-id> --json --input -
zenith roadmap import-plan <plan-id> --json --input -
zenith spike create --json --input -
zenith spike conclude <spike-id> --json --input -
```

Use `roadmap create-plan` when product direction needs to become executable work. The payload must identify exactly one roadmap item by `itemId` or `itemTitle`; optional `phases` can expand the item into a real implementation plan. Created plans preserve `sourceRoadmapId`, `sourceRoadmapItemId`, and source evidence.

`plan next` treats roadmap items with `in_progress` or `planned` status as actionable. Items marked `deferred` are intentionally parked; Zenith will recommend reviewing or reactivating deferred work instead of creating a plan from it automatically. To resume deferred work, update that roadmap item back to `planned` or `in_progress` with a justification.

When a project has multiple roadmaps with active plans, `plan next` may return an ambiguity recommendation (`Set roadmap focus for this worktree: zenith focus set <roadmap-id>`). Use `zenith focus set <roadmap-id>` to bind the current worktree to one roadmap so the agent knows which plan to implement. `zenith focus show --json` reports the current binding and any ambiguity. Multiple roadmaps can coexist, each with its own active plan.

When inserting intermediate roadmap work between existing MVPs, use `position`, `afterItemId`, or `afterItemTitle` instead of renaming later MVPs. Targeted insertions require `justification` so the sequence change remains auditable:

```json
{
  "title": "MVP 4.75 - Operational Memory Polish",
  "afterItemTitle": "MVP 4.5 - Product And Architecture Hardening",
  "justification": "Memory operations should be reliable and auditable before building review/delegation skills on top."
}
```

Use `deferred` to postpone future roadmap work without renaming or deleting it:

```json
{
  "itemTitle": "MVP 5 - PR Review Skill",
  "status": "deferred",
  "justification": "Core TUI and context behavior should be stronger before review skills."
}
```

Findings and sessions close the operational memory loop:

```bash
zenith finding record --json --input -
zenith finding list --status open --json
zenith finding show <finding-id> --json
zenith finding update <finding-id> --json --input -
zenith finding close <finding-id> --json
zenith session start --json --input -
zenith session list --json
zenith session show <session-id> --json
zenith session capture <session-id> --json --input -
zenith session end <session-id> --json --input -
```

`finding record` and `finding update` JSON input accept optional `relatedPlanId` and `relatedPhaseId` to link a finding to an active plan or phase.

Phase progress is recorded with evidence:

```bash
zenith plan update-phase <plan-id> --json --input -
```

`plan update-phase` input accepts optional `dependsOn` (array of phase ids) to declare phase prerequisites. `plan next` skips phases whose dependencies are not yet `done` and returns a recommendation prefixed `Blocked by dependency:` (with a `blockedBy` array) when all remaining todo phases are gated. Add `--stale-after-days <n>` to include next-step staleness metadata.

Use `decode` only as a legacy alias when `zenith` is not available.

## Development

Run the local verification suite:

```bash
bun run typecheck
bun test
bun run build
bun run compile
```

Run the same commands through the convenience CI script:

```bash
bun run ci
```

GitHub Actions runs dependency installation, typecheck, tests, and build on pushes to `main` and pull requests.

## License

MIT. See [LICENSE](LICENSE).
