---
name: zenith-planner
description: Use as the planner role in Zenith wake-on-event choreography; creates or selects executable plans, inspects phase context, and hands scoped work to an implementer with stage/watch state.
---

# Zenith Planner

Use this skill when acting as the planner in a decentralized local agent workflow. The planner owns choosing the next executable Zenith work item and handing a specific plan/phase to an implementer. Zenith is the local memory and wake predicate surface; each agent keeps using its own terminal, model, and harness.

## Ground Rules

- Do not make Zenith spawn Codex, Claude Code, OpenCode, or other provider CLIs.
- Keep long-running watcher agents in tmux or screen when their harness needs a live terminal.
- Use explicit watch timeouts and poll intervals for every handoff.
- Stop instead of looping when `zenith plan next --json` returns `blocking_finding`, `ambiguous_focus`, `blocked_dependency`, `review_finding`, `review_deferred`, or `create_plan_empty`.
- Use `bun run zenith ...` inside the Zenith source checkout if `zenith` is not on PATH.

## Planning Loop

1. Run `zenith context compact --json` and read the active plan, roadmap, findings, and latest session next steps.
2. Run `zenith plan next --json`.
3. If `next.kind` is `create_plan`, create the roadmap-backed executable plan with `zenith roadmap create-plan <roadmap-id> --json --input -`, then run `zenith plan next --json` again.
4. If `next.kind` is `implement_phase`, run `zenith plan phase show <phase-id> --json` and use that phase as the dispatch target.
5. If the next step is blocked, ambiguous, deferred, or finding-driven, stop and report the exact `next.kind`, recommendation, and evidence instead of assigning implementation work.

## Handoff To Implementer

Set `stage=implement` for the phase-scoped implementation stage:

```bash
zenith agent stage set --json --input -
```

```json
{
  "planId": "plan_id",
  "phaseId": "phase_id",
  "stage": "implement",
  "role": "implementer",
  "note": "Implement this phase. Verify, then set stage=review."
}
```

If supervising the workflow, wait for review or done with a timeout:

```bash
zenith agent watch --until stage=review,plan=plan_id,phase=phase_id --json --timeout 3600000 --poll-interval 5000
zenith agent watch --until stage=done,plan=plan_id,phase=phase_id --json --timeout 3600000 --poll-interval 5000
```

After a successful watch, run `zenith report diff --json` to inspect handoff activity before deciding whether more coordination is needed.

## Fan Out To Parallel Implementers

When the active plan has multiple independent phases (no unmet `dependsOn`), dispatch them in parallel instead of one at a time:

```bash
zenith plan dispatchables --json            # parallelGroups = phases ready now; blocked = gated (+blockedBy); needsReview = ready for a reviewer
zenith dispatch --json --format conductor   # one handoff per ready phase (implementer) or needs_review phase (reviewer)
```

Each handoff carries a phase-specific prompt, a suggested `claim`, a branch, and verification commands. Open one agent session per handoff; each implementer takes its claim, edits only its phase, verifies, and sets its own `stage=review`. Add `--claim` to create the claims up front. Then collect the finished phases back in this planning session and serialize the `zenith plan advance --json --input -` calls (the transitions to `done`) — phases are stored independently so parallel work does not collide, but completion must be ordered. Re-run `zenith plan dispatchables --json` to release the next wave as dependencies clear.

Generated for claude.
