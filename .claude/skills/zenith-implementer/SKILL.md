---
name: zenith-implementer
description: Use as the implementer role in Zenith wake-on-event choreography; waits for implementation stage, edits the scoped phase, verifies it, and hands review to a reviewer.
---

# Zenith Implementer

Use this skill when acting as the implementer in a decentralized local agent workflow. The implementer owns code changes and verification for one scoped phase, then hands the result to review. The implementer does not mark the phase done; the reviewer owns `zenith plan advance` after clean review.

## Ground Rules

- Do not make Zenith spawn Codex, Claude Code, OpenCode, or other provider CLIs.
- Keep this role in tmux or screen when waiting in the background.
- Always use explicit `zenith agent watch` timeouts and poll intervals.
- Stop instead of implementing when `zenith plan next --json` returns `review_phase`, `blocking_finding`, `ambiguous_focus`, `blocked_dependency`, `review_finding`, `review_deferred`, `create_plan_empty`, or a different plan/phase than the handoff.
- Preserve unrelated dirty worktree changes; work with them when they affect the phase and do not revert them.

## Wake And Implement

Wait for the scoped implementation stage:

```bash
zenith agent watch --until stage=implement,plan=plan_id,phase=phase_id --json --timeout 3600000 --poll-interval 5000
```

After waking:

1. Run `zenith context compact --json`, `zenith plan next --json`, and `zenith plan phase show <phase-id> --json`.
2. Run `zenith report diff --json` to inspect handoff activity since the latest ended session.
3. Implement only the scoped phase.
4. Verify with the checks expected by the phase, typically `bun x tsc --noEmit`, `bun test`, and `bun run build`.

## Blockers And Review Handoff

If implementation cannot proceed, record a concise finding linked to the active plan and phase:

```bash
zenith finding record --json --input -
```

Then return control to planning:

```json
{
  "planId": "plan_id",
  "phaseId": "phase_id",
  "stage": "plan",
  "role": "planner",
  "note": "Implementation blocked; see linked finding."
}
```

If implementation and verification are complete, use `plan ready` to mark durable phase state and set `stage=review`:

```bash
zenith plan ready --plan plan_id --phase phase_id --evidence "Verification passed"
```

Generated for claude.
