
# Zenith Workflows

Use `bun run zenith ...` for the commands below if the `zenith` binary is not on PATH in this source checkout.

## Continue With Minimal Prompt

Run:

```bash
zenith continue
zenith handoff --to implementer --compact
zenith demo show continuity
```

`zenith continue`, `zenith agent prompt`, and `zenith demo` are read-only by default. Use `continue --start-session`, `--close-open-session`, or `--auto-capture` only when explicit session mutation is intended.

Lower-level equivalent commands:

```bash
zenith context compact --json
zenith plan next --json
```

If `plan next` returns a `phaseId`, inspect it:

```bash
zenith plan phase show phase_id --json
```

Use that phase as the implementation target. If the user's prompt names a different target than `plan next`, stop and ask for confirmation.

## Before Planning

Run:

```bash
zenith continue
zenith context compact --json
zenith plan next --json
zenith plan list --json
```

If the project is not registered, ask whether to run `zenith init`.

## Self-Tracking Telemetry

Use these read-only commands when choosing or auditing the next work:

```bash
zenith report standup                 # daily digest; accepts --days <n>
zenith report roi                     # context compression and continuity signals
zenith report roi --since <cursor>    # event id or ISO timestamp
zenith report diff                    # changes since latest ended session
zenith report diff --since <cursor>   # event id or ISO timestamp
zenith report drift                   # roadmap-vs-active-plan alignment
zenith report adherence               # velocity/adherence; accepts --days <n>
zenith report activity                # 53-week activity heatmap from grouped event counts
zenith plan next --json --stale-after-days 7
```

Telemetry is derived from existing events and memory records. It must stay read-only; record progress with `plan advance`, sessions, findings, or decisions instead.

## Discover Existing Memory

Use deterministic search before creating duplicate memory:

```bash
zenith search --json --query "release docs"
zenith search --json --query "review" --tag pr-review
zenith tag list --json --entity-type plan
zenith tag set plan plan_id --json --input -
```

`tag set` replaces tags for the entity. Tags normalize to lowercase ASCII slugs such as `release-docs`.

## Create A Plan

Use plans only for executable phased work. For direction, use `zenith roadmap create`. For investigation, use `zenith memory spike create` or `zenith memory spike record`.

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

Do not create a plan from a `deferred` or `discarded` roadmap item. `plan next` treats `in_progress` and `todo` roadmap items as actionable; if only deferred items remain, reactivate or discard one with `roadmap update-item` before creating a plan. Discarded items remain visible but do not trigger future work recommendations.

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

Use `discarded` when roadmap work should stay auditable but should no longer be active, deferred, or counted as done:

```json
{
  "itemTitle": "MVP 6 - Agent Backends",
  "status": "discarded",
  "justification": "Provider CLI spawning is no longer in scope; wake-on-event choreography covers the useful local-agent workflow."
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

## Multi-Agent Choreography

Use this when multiple local agent sessions coordinate plan/implement/review work without Zenith spawning vendor CLIs. Zenith stores stage state and exposes blocking watches; each agent uses its own harness/background primitive.

Set a stage:

```bash
zenith agent stage set --json --input -
```

Payload:

```json
{
  "planId": "plan_id",
  "phaseId": "phase_id",
  "stage": "review",
  "role": "codex",
  "note": "Implementation is ready for review."
}
```

Wait for a role handoff:

```bash
zenith agent watch --until stage=review,plan=plan_id,phase=phase_id --json --timeout 3600000 --poll-interval 5000
```

Stages are `plan`, `implement`, `review`, and `done`. Stage state is additive and does not affect `plan next`. Use `zenith report diff --json` after a successful watch to inspect handoff activity. Stop on blocking findings, ambiguous focus, blocked dependencies, deferred-roadmap review, or timeout rather than looping blindly.

## Role-Based Choreography Skills

The agent pack installs role-specific skills for the same stage/watch protocol:

- `zenith-planner`: reads `context compact`, `plan next`, and `phase show`; creates roadmap-backed plans when `next.kind=create_plan`; sets `stage=implement` for the scoped phase.
- `zenith-implementer`: waits for `stage=implement`; inspects `zenith report diff --json` and phase context; implements and verifies the phase; runs `zenith plan ready` to mark `needs_review` and set `stage=review`.
- `zenith-reviewer`: waits for `stage=review`; reviews the scoped implementation; records findings with `relatedPlanId`/`relatedPhaseId`; runs `zenith plan advance --json --input -` only after clean review; sets `stage=done`.

All role skills require explicit watch timeouts and poll intervals, support tmux/screen handoffs, and preserve the rule that Zenith never spawns provider agent CLIs.

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
  "description": "A transient failure can drop in-flight progress.",
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

Use `zenith session summarize --json --input -` when there is no open session id.

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
| `implement_phase` | `zenith plan phase show <phaseId> --json` → implement → verify (`bun x tsc --noEmit && bun test && bun run build`) → `zenith plan ready --plan <planId> --phase <phaseId> --evidence "Verification passed"` |
| `review_phase` | Review the scoped diff; after clean review run `zenith plan advance --json --input -` or `zenith plan done --plan <planId> --phase <phaseId> --evidence "Review passed"` |
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

Before pausing, record a concise checkpoint and then keep the latest event id as a cursor:

```bash
zenith session checkpoint --from-git
zenith session checkpoint "Verified current phase" --next "Next action"
zenith report timeline --json --limit 1   # take data[0].id as cursor
```

When resuming, use the cursor to diff progress since the pause:

```bash
zenith report timeline --json --since <cursor>   # events since pause
zenith continue --compact --json                       # structured context
zenith plan next --json                    # current next step
```
