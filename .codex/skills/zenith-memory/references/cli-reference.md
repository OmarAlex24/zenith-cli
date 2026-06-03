
# Zenith CLI Reference

All agent-facing commands should use `--json`.
If the `zenith` binary is not on PATH while working inside this source checkout, use `bun run zenith ...`.

## Project

- `zenith init --json`
- `zenith project detect --json`
- `zenith project status --json`

## Brief

- `zenith brief set --json --input -`
- `zenith brief show --json`
- `zenith brief list --json`

## Roadmaps

- `zenith roadmap create --json --input -`
- `zenith roadmap list --json`
- `zenith roadmap show <roadmap-id> --json`
- `zenith roadmap workspace --json` — hierarchical view: roadmaps, items, linked plans, phase rollups, and worktree focus
- `zenith roadmap update <roadmap-id> --json --input -`
- `zenith roadmap add-item <roadmap-id> --json --input -`
- `zenith roadmap update-item <roadmap-id> --json --input -`
- `zenith roadmap import-plan <plan-id> --json --input -`
- `zenith roadmap create-plan <roadmap-id> --json --input -`

## Roadmap Focus

- `zenith focus show --json` — current worktree focus, active plan, and ambiguity status
- `zenith focus set <roadmap-id> --json` — bind the current worktree/branch to a roadmap
- `zenith focus clear --json` — remove the focus binding for the current worktree

Roadmap item status semantics: `in_progress` and `todo` are actionable for `plan next`; `deferred` is parked backlog and must be reactivated before creating an executable plan. Roadmap items use `todo / in_progress / done / deferred`; plan phases use `todo / in_progress / done / blocked`. Legacy `pending`/`planned`/`completed` inputs are still accepted and normalized.

## Plans

- `zenith plan create --json --input -`
- `zenith plan list --json`
- `zenith plan show <plan-id> --json`
- `zenith plan update <plan-id> --json --input -`
- `zenith plan update-phase <plan-id> --json --input -`
- `zenith plan next --json`

`plan update-phase` JSON input accepts optional `dependsOn` (array of phase ids) to declare phase prerequisites. When all remaining `todo` phases are gated by unmet dependencies, `plan next` returns a recommendation prefixed `Blocked by dependency:` with a `blockedBy` array.

`plan next` will not auto-create work from deferred roadmap items. If only deferred roadmap work remains, review or reactivate a roadmap item first.

When multiple roadmaps have active plans and the current worktree has no focus binding, `plan next` returns a recommendation to `Set roadmap focus for this worktree: zenith focus set <roadmap-id>`. Use `zenith focus set` to bind the worktree before `plan next` can recommend a phase.

## Context

- `zenith context get --json`
- `zenith context compact --json`
- `zenith resume --json`
- `zenith phase show <phase-id> --json`
- `zenith timeline --json` — read-only activity log; accepts `--limit <n>`

## Decisions

- `zenith decision record --json --input -`
- `zenith decision list --json`
- `zenith decision show <decision-id> --json`

## Findings

- `zenith finding record --json --input -`
- `zenith finding list --status open --json`
- `zenith finding list --status closed --json`
- `zenith finding list --status all --json`
- `zenith finding show <finding-id> --json`
- `zenith finding update <finding-id> --json --input -`
- `zenith finding close <finding-id> --json`

`finding record` and `finding update` JSON input accept optional `relatedPlanId` and `relatedPhaseId` to link a finding to an active plan or phase.

## Spikes

- `zenith spike create --json --input -`
- `zenith spike record --json --input -`
- `zenith spike list --json`
- `zenith spike show <spike-id> --json`
- `zenith spike conclude <spike-id> --json --input -`

## Sessions

- `zenith session start --json --input -`
- `zenith session list --json`
- `zenith session show <session-id> --json`
- `zenith session capture <session-id> --json --input -`
- `zenith session end <session-id> --json --input -`
- `zenith session summarize --json --input -`

## JSON Envelope

```json
{
  "ok": true,
  "data": {},
  "warnings": [],
  "errors": [],
  "meta": {
    "schemaVersion": 1
  }
}
```
