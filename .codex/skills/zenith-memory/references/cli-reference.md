
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
- `zenith roadmap update <roadmap-id> --json --input -`
- `zenith roadmap add-item <roadmap-id> --json --input -`
- `zenith roadmap update-item <roadmap-id> --json --input -`
- `zenith roadmap import-plan <plan-id> --json --input -`
- `zenith roadmap create-plan <roadmap-id> --json --input -`

Roadmap item status semantics: `in_progress` and `todo` are actionable for `plan next`; `deferred` is parked backlog and must be reactivated before creating an executable plan; `discarded` is an auditable no-longer-planned scope decision and is not recommended as future work. Roadmap items use `todo / in_progress / done / deferred / discarded`; plan phases use `todo / in_progress / done / blocked`. Legacy `pending`/`planned`/`completed` inputs are still accepted and normalized; `canceled`/`cancelled` normalize to `discarded`.

## Plans

- `zenith plan create --json --input -`
- `zenith plan list --json`
- `zenith plan show <plan-id> --json`
- `zenith plan update <plan-id> --json --input -`
- `zenith plan update-phase <plan-id> --json --input -`
- `zenith plan next --json`
- `zenith plan next --json --stale-after-days <n>` — include optional `staleness` metadata on the next step
- `zenith plan complete <plan-id> --json` — mark plan completed (all phases must be done); advances source roadmap item to `done`
- `zenith plan advance --json --input -` — mark a phase done + append evidence + recompute next step (one transaction); returns `AdvanceResult`
- `zenith plan path <plan-id> --json` — topological view of phases: `orderedPhases`, `criticalPath`, `remaining`, `ready` flags

`plan update-phase` JSON input accepts optional `dependsOn` (array of phase ids) to declare phase prerequisites. When all remaining `todo` phases are gated by unmet dependencies, `plan next` returns a recommendation prefixed `Blocked by dependency:` with a `blockedBy` array.

`plan next` will not auto-create work from deferred or discarded roadmap items. If only deferred roadmap work remains, review or reactivate a roadmap item first. Discarded roadmap items are ignored until explicitly moved back to `todo` or `in_progress`.

### plan next — NextStep.kind discriminant

`plan next --json` now returns an optional `kind` field for clean switch-dispatch in agent loops:

| kind | meaning |
|---|---|
| `implement_phase` | Implement the identified phase (in-progress or ready todo) |
| `create_plan` | Create a plan from the roadmap item |
| `review_deferred` | Reactivate or discard a deferred roadmap item |
| `blocking_finding` | Fix or triage the critical/high finding |
| `review_finding` | Review an open finding (no active plan) |
| `ambiguous_focus` | Set `zenith focus set <roadmap-id>` to resolve multiple active plans |
| `blocked_dependency` | Unblock a dependency (blocked phase or all todos gated) |
| `review_completed` | All phases done; complete or archive the active plan |
| `create_plan_empty` | No plan, roadmap, finding, or session — create a plan |

`kind` is omitted when the fallback is a freeform session next-step.

When `--stale-after-days <n>` is provided, `NextStep` may include `staleness`: `{ stale, ageDays, staleAfterDays, lastUpdatedAt }`. The default `plan next --json` response omits it for compatibility.

### plan advance — AdvanceResult

`plan advance` payload: `{ planId, completedPhaseId?, status?, evidence[] }`

Response `data`:
```json
{
  "completed": { "phaseId": "phase_x", "status": "done" },
  "planCompleted": false,
  "roadmapItemAdvanced": null,
  "next": { "recommendation": "...", "reason": "...", "kind": "implement_phase" }
}
```

If all phases are done after the advance, `planCompleted` is `true` and (if linked) `roadmapItemAdvanced` contains `{ roadmapId, itemId }`.

## Agent Choreography

- `zenith stage set --json --input -` — set additive project/plan/phase stage state for local multi-agent handoffs
- `zenith watch --until stage=review,plan=<plan-id>,phase=<phase-id> --json [--timeout <ms>] [--poll-interval <ms>]` — block until a local memory predicate matches

`stage set` accepts `stage` values `plan / implement / review / done`, optional `planId`, optional `phaseId`, optional `role`, and optional `note`. If `phaseId` is provided without `planId`, Zenith derives and returns the parent plan. Stage state is additive choreography metadata; it does not affect `plan next`.

`watch --until` accepts comma-separated `key=value` clauses with `stage` required and optional `plan`/`phase` (or `planId`/`phaseId`) scope keys. Use explicit `--timeout` and `--poll-interval` for long-running agent wake loops.

## Context

- `zenith context get --json`
- `zenith context compact --json`
- `zenith resume --json`
- `zenith phase show <phase-id> --json`
- `zenith timeline --json` — read-only activity log; accepts `--limit <n>` and `--since <eventId|iso>`

Use `--since <eventId|iso>` to return only events after a checkpoint cursor (ISO timestamp or event id). Useful for resumed sessions to diff progress without re-reading the entire timeline.

## Self-Tracking Telemetry

- `zenith standup --json [--days <n>]` — daily digest of next step, events, completions, roadmap progress, and findings; default 1 day
- `zenith diff --json [--since <eventId|iso>] [--limit <n>]` — events since a cursor, or since the latest ended session by default
- `zenith drift --json [--stale-after-days <n>]` — roadmap-vs-active-plan alignment report; default stale threshold 7 days
- `zenith adherence --json [--days <n>]` — event-derived velocity and completion metrics; default 14 days
- `zenith activity --json` — uncapped 53-week activity heatmap from grouped event counts; used by the TUI Pulse view

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
