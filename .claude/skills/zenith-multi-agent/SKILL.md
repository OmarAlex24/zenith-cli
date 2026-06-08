---
name: zenith-multi-agent
description: Use as the shared Zenith wake-on-event choreography protocol reference, especially for non-standard multi-agent handoffs; prefer zenith-planner, zenith-implementer, and zenith-reviewer for normal phase work.
---

# Zenith Multi-Agent Choreography

Use this skill as the protocol reference for decentralized local-agent handoffs. For normal phase work, use the role-specific skills instead:

- `zenith-planner`: chooses or creates executable work and sets `stage=implement`.
- `zenith-implementer`: waits for `stage=implement`, implements/verifies, and runs `zenith plan ready` to mark `needs_review` and set `stage=review`.
- `zenith-reviewer`: waits for `stage=review`, records findings or advances clean phases, and sets `stage=done`.

Use `zenith-multi-agent` when designing or debugging the shared choreography contract, coordinating roles outside planner/implementer/reviewer, or checking stage/watch scope rules. Zenith is the deterministic memory and wake predicate surface; each agent session stays responsible for its own terminal, model, and harness.

## Ground Rules

- Do not make Zenith spawn Codex, Claude Code, OpenCode, or other provider CLIs.
- Do not use MCP/Channels as the handoff mechanism for this workflow.
- Keep each agent in a live terminal session such as tmux or screen when its harness needs a background watcher to wake it.
- Dispatch `review_phase` to a reviewer; dispatch `implement_phase` to an implementer.
- Stop instead of looping when `zenith plan next --json` returns `blocking_finding`, `ambiguous_focus`, `blocked_dependency`, `review_finding`, `review_deferred`, or `create_plan_empty`.
- Use timeouts on watches so a stalled workflow returns control.

## Stage Contract

Stages are additive choreography state and do not change `plan next` determinism.

```bash
zenith agent stage set --json --input -
zenith agent watch --until stage=implement,plan=plan_id,phase=phase_id --json --timeout 3600000 --poll-interval 5000
```

Stage payload:

```json
{
  "planId": "plan_id",
  "phaseId": "phase_id",
  "stage": "implement",
  "role": "opencode",
  "note": "Implementation can start."
}
```

Use `plan`, `implement`, `review`, and `done` as the shared stage vocabulary. Include `planId` and `phaseId` when coordinating a specific phase; omit both only for project-level coordination.

## Generic Wake Loop

Use this only for custom roles or when a role-specific skill does not fit.

1. Run `zenith context compact --json`, `zenith plan next --json`, and, when scoped to a phase, `zenith plan phase show <phase-id> --json`.
2. If this role should wait, start a background watch with the local harness primitive: `zenith agent watch --until stage=<your-role>,plan=<plan-id>,phase=<phase-id> --json --timeout <ms> --poll-interval <ms>`.
3. When the watch exits successfully, run `zenith report diff --json` to inspect handoff activity since the latest ended session.
4. Perform only this role's work.
5. Transition to the next stage with `zenith agent stage set --json --input -`.
6. Relaunch the next watch or stop when the phase/plan is done.

## Standard Handoff

For this common path, invoke the role-specific skills:

- `zenith-planner` sets `stage=implement` with a concrete plan/phase handoff.
- `zenith-implementer` waits for `stage=implement`, edits code, verifies, then runs `zenith plan ready` to mark `needs_review` and set `stage=review`.
- `zenith-reviewer` waits for `stage=review`, records findings or runs `zenith plan advance --json --input -`, then sets `stage=done` or returns to `stage=implement` with a concrete note.

## Parallel Fan-Out

The standard handoff is one phase at a time, but independent phases (no unmet `dependsOn`) can run concurrently. The planner uses `zenith plan dispatchables --json` to list every ready phase and `zenith dispatch --json [--claim] [--format conductor]` to emit one handoff per phase, then opens a separate agent session per handoff. Each session takes its own `claim` to avoid scope collisions, edits only its phase, and sets its own `stage=review`. Convergence stays serialized: the planning session orders the `plan advance` calls that move phases to `done`. Zenith only emits the manifest — it never spawns the sessions.

Generated for claude.
