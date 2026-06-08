# Zenith Machine/API Reference

This is the advanced command catalog for scripts, tests, integrations, and agents that need exact fields. Normal human and agent handoff should start with markdown commands such as `zenith continue` and `zenith handoff --to implementer --compact`.

All commands below use `--json` when a stable machine-readable envelope is needed. When working from this source checkout and `zenith` is not on `PATH`, prefix commands with `bun run`.

## OpenTUI

```bash
zenith
zenith tui
```

Both commands open the read-only OpenTUI dashboard. `tui` does not emit a JSON envelope.

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

## Project

```bash
zenith init --json
zenith project detect --json
zenith project status --json
```

## Brief

```bash
zenith memory brief set --json --input -
zenith memory brief show --json
zenith memory brief list --json
```

## Roadmaps

```bash
zenith roadmap create --json --input -
zenith roadmap list --json
zenith roadmap show <roadmap-id> --json
zenith roadmap update <roadmap-id> --json --input -
zenith roadmap add-item <roadmap-id> --json --input -
zenith roadmap update-item <roadmap-id> --json --input -
zenith roadmap import-plan <plan-id> --json --input -
zenith roadmap create-plan <roadmap-id> --json --input -
zenith roadmap workspace --json
```

Roadmap items use `todo / in_progress / done / deferred / discarded`. Plan phases use `todo / in_progress / needs_review / done / blocked`. Deferred roadmap items are parked backlog; discarded items are auditable out-of-scope decisions. `needs_review` is durable work state; `stage=review` is additive handoff state for agent choreography.

## Plans And Phases

```bash
zenith plan create --json --input -
zenith plan list --json
zenith plan show <plan-id> --json
zenith plan update <plan-id> --json --input -
zenith plan update-phase <plan-id> --json --input -
zenith plan next --json
zenith plan next --json --stale-after-days <n>
zenith plan complete <plan-id> --json
zenith plan advance --json --input -
zenith plan path <plan-id> --json
zenith plan dispatchables [plan-id] --json
zenith dispatch [plan-id] --json [--claim] [--format markdown|codex|conductor]
zenith plan phase show <phase-id> --json
```

`plan update-phase` accepts optional `dependsOn` to declare prerequisites. `plan next --json` returns an optional `kind` discriminant such as `implement_phase`, `review_phase`, `create_plan`, `review_deferred`, `blocking_finding`, `review_finding`, `ambiguous_focus`, `blocked_dependency`, `review_completed`, or `create_plan_empty`.

`plan dispatchables` and `dispatch` are the parallel fan-out counterpart to the serial `plan next`. `dispatchables` returns every phase that can run now (`parallelGroups`), plus `blocked` (with `blockedBy`), `needsReview`, and `blockingFindings`. `dispatch` renders one handoff per dispatchable phase — an implementer prompt for ready phases, a reviewer prompt for `needs_review` — each with a phase-specific prompt, suggested claim, branch, and verification commands; `--claim` creates the claims and `--format conductor` lays them out as `Workspace N` blocks. Run the implementer handoffs in separate agent sessions (each takes its claim and sets its own `stage=review`), then serialize the converging `plan advance` calls in the planning session. Zenith emits the manifest only; it never spawns agents.

`plan advance` payload:

```json
{
  "planId": "plan_id",
  "completedPhaseId": "phase_id",
  "status": "done",
  "evidence": [{ "kind": "note", "value": "Verification passed." }]
}
```

## Context And Handoff

```bash
zenith continue --json
zenith continue --start-session --json
zenith continue --close-open-session --start-session --json
zenith continue --auto-capture --json
zenith context get --json
zenith context compact --json
zenith continue --compact --json
zenith report roi --json
zenith report roi --since <event-id-or-iso> --json
zenith agent prompt --format markdown --json
zenith agent prompt --format agent --json
zenith agent prompt --format codex --max-tokens 800 --json
zenith agent prompt --format claude --metadata --json
zenith agent prompt --role planner --format codex --json
zenith agent prompt --role implementer --format codex --json
zenith agent prompt --role reviewer --format codex --json
zenith agent prompt --role handoff --format codex --json
zenith report timeline --json
zenith report timeline --json --limit <n>
zenith report timeline --json --since <event-id-or-iso>
```

Without `--json`, `continue`, `continue --compact`, `handoff`, `agent prompt`, and demos emit markdown/plain text for compact handoff.

`continue --json` may include `actionBriefing`: `{ goal, lastSession, remainingWork, nextAction, blockers, freshness, suggestedCommands }`. Markdown output is ordered as `Where We Are`, `What Changed Last`, `What Remains`, `Next Action`, `Risk Radar`, `Freshness`, `Worktree`, `Details`, and `ROI`.

Prompt roles change section priority without changing the output format. Use `planner`, `implementer`, `reviewer`, or `handoff` when a compact prompt should bias toward the role's next decision.

## Demos And Benchmarks

```bash
zenith demo list --json
zenith demo show continuity --json
zenith demo show daily-loop --json
zenith demo show benchmark-proof --json
zenith benchmark list --json
zenith benchmark task <scenario-id> --variant <variant> --json
zenith benchmark record --json --input -
zenith benchmark runs --json
zenith benchmark compare --json
zenith benchmark compare --scenario <scenario-id> --json
```

Benchmark records store strict run metadata under Zenith home. They reject transcripts, prompts, outputs, secrets, tokens, credentials, full diffs, and unknown fields.

## Self-Tracking Telemetry

```bash
zenith report standup --json
zenith report standup --json --days <n>
zenith report diff --json
zenith report diff --json --since <event-id-or-iso>
zenith report diff --json --limit <n>
zenith report drift --json
zenith report drift --json --stale-after-days <n>
zenith report adherence --json
zenith report adherence --json --days <n>
zenith report activity --json
```

Telemetry is derived from existing events and context records and remains read-only.

## Context Discovery

```bash
zenith search --json --query <text>
zenith search --json --query <text> --tag <tag>
zenith search --json --query <text> --entity-type <type>
zenith tag set <entity-type> <entity-id> --json --input -
zenith tag list --json
zenith tag list --json --tag <tag>
```

Supported discovery entity types are `brief`, `roadmap`, `roadmap_item`, `plan`, `phase`, `spike`, `decision`, `finding`, `session`, and `context_doc`.

## Docs Anchors

```bash
zenith docs suggest --task current --json
zenith docs pin <path> --task current --json
zenith docs ignore <path> --task current --json
zenith docs list --task current --json
```

`docs suggest` is read-only. `pin` and `ignore` store lightweight `context_doc` anchors: path, scope (`project | plan | phase`), reason, short summary, assumptions, confidence, status, read timestamp, read commit, and observed file mtime. Zenith stores anchors and summaries, not full documentation copies.

## Low-Friction Writes

```bash
zenith session checkpoint "Summary" --next "Next step" --json
zenith session checkpoint --from-git --json
zenith session checkpoint --from-git --save --summary "Summary" --next "Next step" --json
zenith session note "Short note" --json
zenith decision record "Title" --context "Context" --decision "Decision" --json
zenith plan ready --plan <plan-id> --phase <phase-id> --evidence "Verification passed" --json
zenith plan done --json
zenith finding close <finding-id> --evidence "Reviewed" --json
zenith finding record "Title" --description "Why blocked" --json
zenith finding record "Title" --description "Why blocked" --plan <plan-id> --phase <phase-id> --json
zenith plan block --phase <phase-id> --plan <plan-id> --json
```

`session checkpoint --from-git` returns a read-only draft unless `--save` is provided. The draft includes branch, HEAD commit subject, changed files, files changed since base, inferred next step, and evidence.

`plan ready` marks the phase `needs_review`, appends evidence, and sets `stage=review`; it does not count as phase completion. `plan done` marks reviewed work complete. `plan complete` requires all phases to be `done`.

These commands intentionally write local context records except the read-only git checkpoint draft. Use the detailed commands below when exact record lifecycle control is needed.

Evidence accepts `{ "kind": "note|commit|file|pr|command|link", "value": "..." }` on decisions, findings, sessions/checkpoints, `plan ready`, `plan done`, and `plan block`.

## Decisions

```bash
zenith decision record --json --input -
zenith decision list --json
zenith decision show <decision-id> --json
```

## Findings

```bash
zenith finding record --json --input -
zenith finding list --json
zenith finding list --status open --json
zenith finding list --status closed --json
zenith finding list --status all --json
zenith finding show <finding-id> --json
zenith finding update <finding-id> --json --input -
zenith finding close <finding-id> --evidence "Reviewed" --json
```

`finding record` and `finding update` accept optional `relatedPlanId` and `relatedPhaseId`.

## Sessions

```bash
zenith session start --json --input -
zenith session list --json
zenith session show <session-id> --json
zenith session capture <session-id> --json --input -
zenith session end <session-id> --json --input -
zenith session summarize --json --input -
```

## Spikes

```bash
zenith memory spike create --json --input -
zenith memory spike record --json --input -
zenith memory spike list --json
zenith memory spike show <spike-id> --json
zenith memory spike conclude <spike-id> --json --input -
```

## Focus And Choreography

```bash
zenith agent focus show --json
zenith agent focus set <roadmap-id> --json
zenith agent focus clear --json
zenith agent stage set --json --input -
zenith agent watch --until stage=review,plan=<plan-id>,phase=<phase-id> --json
zenith agent watch --until stage=review --json --timeout <ms> --poll-interval <ms>
```

`stage set` accepts `plan / implement / review / done` plus optional plan, phase, role, and note fields. Stage state is additive choreography metadata and does not affect `plan next`.

## Agent Packs

```bash
zenith agent install codex --json
zenith agent install claude --json
```

The agent pack installs `zenith-memory`, `zenith-pr-review`, `zenith-multi-agent`, `zenith-planner`, `zenith-implementer`, and `zenith-reviewer`.
