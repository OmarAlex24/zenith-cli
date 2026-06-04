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
4. If `next.kind` is `implement_phase`, run `zenith phase show <phase-id> --json` and use that phase as the dispatch target.
5. If the next step is blocked, ambiguous, deferred, or finding-driven, stop and report the exact `next.kind`, recommendation, and evidence instead of assigning implementation work.

## Handoff To Implementer

Set `stage=implement` for the phase-scoped implementation stage:

```bash
zenith stage set --json --input -
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
zenith watch --until stage=review,plan=plan_id,phase=phase_id --json --timeout 3600000 --poll-interval 5000
zenith watch --until stage=done,plan=plan_id,phase=phase_id --json --timeout 3600000 --poll-interval 5000
```

After a successful watch, run `zenith diff --json` to inspect handoff activity before deciding whether more coordination is needed.

Generated for claude.
