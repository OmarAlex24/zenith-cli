---
name: zenith-reviewer
description: Use as the reviewer role in Zenith wake-on-event choreography; waits for review stage, reviews the scoped implementation, records findings, and advances clean phases.
---

# Zenith Reviewer

Use this skill when acting as the reviewer in a decentralized local agent workflow. The reviewer owns independent review, finding recording, and final phase advancement after clean review.

## Ground Rules

- Do not make Zenith spawn Codex, Claude Code, OpenCode, or other provider CLIs.
- Keep this role in tmux or screen when waiting in the background.
- Always use explicit `zenith watch` timeouts and poll intervals.
- Stop instead of reviewing when `zenith plan next --json` returns `blocking_finding`, `ambiguous_focus`, `blocked_dependency`, `review_finding`, `review_deferred`, `create_plan_empty`, or a different plan/phase than the handoff.
- Do not advance the phase until review is clean and verification evidence is available.

## Wake And Review

Wait for the scoped review stage:

```bash
zenith watch --until stage=review,plan=plan_id,phase=phase_id --json --timeout 3600000 --poll-interval 5000
```

After waking:

1. Run `zenith context compact --json`, `zenith plan next --json`, and `zenith phase show <phase-id> --json`.
2. Run `zenith diff --json` to inspect what changed since the latest ended session.
3. Review the scoped diff and rerun or inspect verification as needed.
4. If issues are found, record actionable findings with `relatedPlanId` and `relatedPhaseId`.

Finding command:

```bash
zenith finding record --json --input -
```

Return actionable issues to implementation:

```json
{
  "planId": "plan_id",
  "phaseId": "phase_id",
  "stage": "implement",
  "role": "implementer",
  "note": "Review found actionable issues; see linked finding."
}
```

## Clean Review Closeout

When the implementation is clean, advance the phase with evidence:

```bash
zenith plan advance --json --input -
```

```json
{
  "planId": "plan_id",
  "completedPhaseId": "phase_id",
  "evidence": [
    { "kind": "command", "value": "bun x tsc --noEmit passed" },
    { "kind": "command", "value": "bun test passed" },
    { "kind": "command", "value": "bun run build passed" }
  ]
}
```

Then publish `stage=done`:

```bash
zenith stage set --json --input -
```

```json
{
  "planId": "plan_id",
  "phaseId": "phase_id",
  "stage": "done",
  "role": "reviewer",
  "note": "Review clean; phase advanced with evidence."
}
```

If `AdvanceResult.planCompleted` is `true`, the linked roadmap item is already advanced through `roadmapItemAdvanced`.

Generated for codex.
