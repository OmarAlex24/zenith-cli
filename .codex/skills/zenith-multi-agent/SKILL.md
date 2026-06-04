---
name: zenith-multi-agent
description: Use when coordinating multiple local AI agent sessions with Zenith wake-on-event choreography; relies on stage state, watch predicates, and each agent's own harness instead of Zenith spawning vendor CLIs.
---

# Zenith Multi-Agent Choreography

Use this skill when a project wants decentralized plan/implement/review handoffs across local agent sessions. Zenith is the deterministic memory and wake predicate surface; each agent session stays responsible for its own terminal, model, and harness.

## Ground Rules

- Do not make Zenith spawn Codex, Claude Code, OpenCode, or other provider CLIs.
- Do not use MCP/Channels as the handoff mechanism for this workflow.
- Keep each agent in a live terminal session such as tmux or screen when its harness needs a background watcher to wake it.
- Stop instead of looping when `zenith plan next --json` returns `blocking_finding`, `ambiguous_focus`, `blocked_dependency`, `review_finding`, `review_deferred`, or `create_plan_empty`.
- Use timeouts on watches so a stalled workflow returns control.

## Stage Contract

Stages are additive choreography state and do not change `plan next` determinism.

```bash
zenith stage set --json --input -
zenith watch --until stage=implement,plan=plan_id,phase=phase_id --json --timeout 3600000 --poll-interval 5000
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

## Wake Loop

1. Run `zenith context compact --json`, `zenith plan next --json`, and `zenith phase show <phase-id> --json`.
2. If this role should wait, start a background watch with the local harness primitive: `zenith watch --until stage=<your-role>,plan=<plan-id>,phase=<phase-id> --json --timeout <ms> --poll-interval <ms>`.
3. When the watch exits successfully, run `zenith diff --json` to inspect handoff activity since the latest ended session.
4. Perform only this role's work.
5. Transition to the next stage with `zenith stage set --json --input -`.
6. Relaunch the next watch or stop when the phase/plan is done.

## Typical Handoff

- Planner sets `stage=implement` with role `opencode`.
- Implementer waits for `stage=implement`, edits code, verifies, then sets `stage=review` with role `codex`.
- Reviewer waits for `stage=review`, reviews or records findings, then sets `stage=done` or returns to `stage=implement` with a concrete note.

Generated for codex.
