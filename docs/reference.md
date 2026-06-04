# Zenith Machine/API Reference

This is the advanced command catalog for scripts, tests, integrations, and agents that need exact fields. Normal human and agent handoff should start with markdown commands such as `zenith continue` and `zenith prompt --format codex --max-tokens 800`.

All commands below use `--json` when a stable machine-readable envelope is needed. When working from this source checkout and `zenith` is not on `PATH`, prefix commands with `bun run`.

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
zenith brief set --json --input -
zenith brief show --json
zenith brief list --json
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

Roadmap items use `todo / in_progress / done / deferred / discarded`. Plan phases use `todo / in_progress / done / blocked`. Deferred roadmap items are parked backlog; discarded items are auditable out-of-scope decisions.

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
zenith phase show <phase-id> --json
```

`plan update-phase` accepts optional `dependsOn` to declare prerequisites. `plan next --json` returns an optional `kind` discriminant such as `implement_phase`, `create_plan`, `review_deferred`, `blocking_finding`, `review_finding`, `ambiguous_focus`, `blocked_dependency`, `review_completed`, or `create_plan_empty`.

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
zenith resume --json
zenith roi --json
zenith roi --since <event-id-or-iso> --json
zenith prompt --format markdown --json
zenith prompt --format agent --json
zenith prompt --format codex --max-tokens 800 --json
zenith prompt --format claude --metadata --json
zenith timeline --json
zenith timeline --json --limit <n>
zenith timeline --json --since <event-id-or-iso>
```

Without `--json`, `continue`, `prompt`, `resume`, and demos emit markdown/plain text for compact handoff.

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
zenith standup --json
zenith standup --json --days <n>
zenith diff --json
zenith diff --json --since <event-id-or-iso>
zenith diff --json --limit <n>
zenith drift --json
zenith drift --json --stale-after-days <n>
zenith adherence --json
zenith adherence --json --days <n>
zenith activity --json
```

Telemetry is derived from existing events and memory records and remains read-only.

## Memory Discovery

```bash
zenith search --json --query <text>
zenith search --json --query <text> --tag <tag>
zenith search --json --query <text> --entity-type <type>
zenith tag set <entity-type> <entity-id> --json --input -
zenith tag list --json
zenith tag list --json --tag <tag>
```

Supported discovery entity types are `brief`, `roadmap`, `roadmap_item`, `plan`, `phase`, `spike`, `decision`, `finding`, and `session`.

## Low-Friction Writes

```bash
zenith checkpoint "Summary" --next "Next step" --json
zenith note "Short note" --json
zenith decide "Title" --context "Context" --decision "Decision" --json
zenith done --json
zenith done --finding <finding-id> --json
zenith blocked "Title" --description "Why blocked" --json
zenith blocked "Title" --description "Why blocked" --plan <plan-id> --phase <phase-id> --json
zenith blocked --mark-phase <phase-id> --plan <plan-id> --json
```

These commands intentionally write memory. Use the detailed commands below when exact record lifecycle control is needed.

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
zenith finding close <finding-id> --json
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
zenith spike create --json --input -
zenith spike record --json --input -
zenith spike list --json
zenith spike show <spike-id> --json
zenith spike conclude <spike-id> --json --input -
```

## Focus And Choreography

```bash
zenith focus show --json
zenith focus set <roadmap-id> --json
zenith focus clear --json
zenith stage set --json --input -
zenith watch --until stage=review,plan=<plan-id>,phase=<phase-id> --json
zenith watch --until stage=review --json --timeout <ms> --poll-interval <ms>
```

`stage set` accepts `plan / implement / review / done` plus optional plan, phase, role, and note fields. Stage state is additive choreography metadata and does not affect `plan next`.

## Agent Packs

```bash
zenith agents install codex --json
zenith agents install claude --json
```

The agent pack installs `zenith-memory`, `zenith-pr-review`, `zenith-multi-agent`, `zenith-planner`, `zenith-implementer`, and `zenith-reviewer`.
