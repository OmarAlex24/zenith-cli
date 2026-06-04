
# Zenith Workflows

Use `bun run zenith ...` for the commands below if the `zenith` binary is not on PATH in this source checkout.

## Continue With Minimal Prompt

Run:

```bash
zenith context compact --json
zenith plan next --json
```

If `plan next` returns a `phaseId`, inspect it:

```bash
zenith phase show phase_id --json
```

Use that phase as the implementation target. If the user's prompt names a different target than `plan next`, stop and ask for confirmation.

## Before Planning

Run:

```bash
zenith context compact --json
zenith plan next --json
zenith plan list --json
```

If the project is not registered, ask whether to run `zenith init --json`.

## Self-Tracking Telemetry

Use these read-only commands when choosing or auditing the next work:

```bash
zenith standup --json                 # daily digest; accepts --days <n>
zenith diff --json                    # changes since latest ended session
zenith diff --json --since <cursor>   # event id or ISO timestamp
zenith drift --json                   # roadmap-vs-active-plan alignment
zenith adherence --json               # velocity/adherence; accepts --days <n>
zenith plan next --json --stale-after-days 7
```

Telemetry is derived from existing events and memory records. It must stay read-only; record progress with `plan advance`, sessions, findings, or decisions instead.

## Create A Plan

Use plans only for executable phased work. For direction, use `zenith roadmap create`. For investigation, use `zenith spike create` or `zenith spike record`.

Use stdin JSON:

```bash
zenith plan create --json --input -
```

Payload:

```json
{
  "title": "Feature v1",
  "description": "Short purpose",
  "phases": [
    {
      "title": "Foundation",
      "status": "todo",
      "acceptanceCriteria": ["Command compiles", "Tests pass"]
    }
  ]
}
```

## Convert Roadmap Direction To A Plan

Use this when a roadmap item is the next product target and there is no active plan.

```bash
zenith roadmap create-plan roadmap_id --json --input -
```

Payload:

```json
{
  "itemId": "rmi_id",
  "title": "Executable plan title",
  "priority": "high",
  "phases": [
    {
      "title": "Implementation phase",
      "acceptanceCriteria": ["CLI flow works", "Tests pass"]
    }
  ]
}
```

Created plans preserve `sourceRoadmapId`, `sourceRoadmapItemId`, and source evidence. Use `itemTitle` instead of `itemId` only when the title is unique.

Do not create a plan from a `deferred` roadmap item. `plan next` treats `in_progress` and `todo` roadmap items as actionable; if only deferred items remain, reactivate one with `roadmap update-item` before creating a plan.

## Insert Intermediate Roadmap Work

Use this when new prerequisite work belongs between existing MVPs. Do not rename later MVPs to make room; insert the new item after the completed/current item and explain why.

```bash
zenith roadmap add-item roadmap_id --json --input -
```

Payload:

```json
{
  "title": "MVP 4.75 - Operational Memory Polish",
  "description": "Make memory operations inspectable and auditable before advanced skills.",
  "afterItemTitle": "MVP 4.5 - Product And Architecture Hardening",
  "justification": "Memory operations should be reliable and auditable before building review/delegation skills on top."
}
```

Targeted insertions with `position`, `afterItemId`, or `afterItemTitle` require `justification`.

## Defer Roadmap Work

Use this when future roadmap work should stay visible but should not become the next executable plan automatically.

```bash
zenith roadmap update-item roadmap_id --json --input -
```

Payload:

```json
{
  "itemTitle": "MVP 5 - PR Review Skill",
  "status": "deferred",
  "justification": "Core TUI and context behavior should be stronger before review skills."
}
```

Deferred items are parked, not abandoned. To resume one, update it back to `todo` or `in_progress` with a new justification.

## Update A Phase

```bash
zenith plan update-phase plan_id --json --input -
```

Payload:

```json
{
  "phaseTitle": "Foundation",
  "status": "done",
  "evidence": [
    {
      "kind": "note",
      "value": "Implemented storage migration tests."
    }
  ]
}
```

## Sequence Phases With Dependencies

To declare that a phase must not start until another phase is done, set `dependsOn` via `plan update-phase`:

```bash
zenith plan update-phase plan_id --json --input -
```

Payload:

```json
{
  "phaseId": "phase_x",
  "dependsOn": ["phase_y"]
}
```

`plan next` skips phases whose `dependsOn` prerequisites are not yet `done`. When all remaining `todo` phases are gated, `plan next` returns a recommendation prefixed `Blocked by dependency:` and includes a `blockedBy` array listing the blocking phase ids.

## Update Plan Metadata

```bash
zenith plan update plan_id --json --input -
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

Use this for renaming plans, changing descriptions, pausing/activating plans, or changing priority. Do not update plan metadata with SQL.

## Close Completed Work

After implementation, run:

```bash
bun x tsc --noEmit
bun test
bun run build
zenith plan update-phase plan_id --json --input -
```

Evidence payload:

```json
{
  "phaseId": "phase_id",
  "status": "done",
  "evidence": [
    { "kind": "command", "value": "bun x tsc --noEmit passed" },
    { "kind": "command", "value": "bun test passed" },
    { "kind": "command", "value": "bun run build passed" }
  ]
}
```

## Record Findings

```bash
zenith finding record --json --input -
```

Payload:

```json
{
  "type": "bug",
  "severity": "high",
  "title": "Missing retry around sync",
  "description": "A transient failure can drop pending progress.",
  "relatedFiles": ["src/sync.ts"],
  "relatedPlanId": "plan_id",
  "relatedPhaseId": "phase_id"
}
```

Both `relatedPlanId` and `relatedPhaseId` are optional; include them to link the finding to the active plan or phase. `finding update` accepts the same optional fields.

Close a finding after the issue is handled:

```bash
zenith finding show finding_id --json
zenith finding update finding_id --json --input -
zenith finding close finding_id --json
```

## End A Session

```bash
zenith session list --json
zenith session show session_id --json
zenith session end session_id --json --input -
```

Payload:

```json
{
  "summary": "Implemented the storage layer and tests.",
  "nextSteps": ["Wire CLI commands to the app service"]
}
```

Use `zenith session summarize --json --input -` as a compatibility shortcut when there is no open session id.

## Long-Running Loop (multi-phase roadmap grind)

Use this workflow when driving a whole roadmap across one session (or resumed sessions).

### Setup — scope the work

```bash
zenith plan path plan_id --json   # topological order, criticalPath, ready flags
zenith plan next --json           # first action
```

### Iteration — one phase at a time

Read `next.kind` and dispatch:

| kind | action |
|---|---|
| `implement_phase` | `zenith phase show <phaseId> --json` → implement → verify (`bun x tsc --noEmit && bun test && bun run build`) → `zenith plan advance --json --input -` |
| `blocking_finding` | STOP — hand back to user |
| `ambiguous_focus` | STOP — hand back to user |
| `blocked_dependency` | STOP — hand back to user |
| `review_finding` | STOP — hand back to user |
| `review_completed` | Run `zenith plan complete <plan-id> --json` then continue to next roadmap item |
| `create_plan` | Run `zenith roadmap create-plan <roadmap-id> --json --input -` then loop |
| `create_plan_empty` | STOP — hand back to user |
| `review_deferred` | STOP — hand back to user |

Advance payload (mark phase done with evidence):

```json
{
  "planId": "plan_id",
  "completedPhaseId": "phase_id",
  "evidence": [
    { "kind": "command", "value": "bun x tsc --noEmit passed" },
    { "kind": "command", "value": "bun test passed" }
  ]
}
```

If `planCompleted` is `true` in the `AdvanceResult`, the plan has auto-completed and `roadmapItemAdvanced` reports which roadmap item moved to `done`. `next` already points at the next roadmap item.

### Checkpoint / Resume

Before pausing, record the latest event id as a cursor:

```bash
zenith timeline --json --limit 1   # take data[0].id as cursor
```

When resuming, use the cursor to diff progress since the pause:

```bash
zenith timeline --json --since <cursor>   # events since pause
zenith resume --json                       # structured context
zenith plan next --json                    # current next step
```
