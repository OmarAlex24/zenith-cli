<!-- BEGIN ZENITH CLI -->
# Zenith Agent Guidance

This repository uses Zenith CLI as private local guidance context for agents.

Use the zenith-memory skill at .claude/skills/zenith-memory/SKILL.md when:
- recording the project brief or long-running roadmap
- creating implementation plans
- recording bounded research spikes
- continuing previous work
- updating project progress
- recording technical decisions
- recording and closing findings
- starting, capturing, ending, or summarizing a coding session
- viewing recent project activity (`zenith timeline`)
- viewing continuity ROI (`zenith roi`)
- viewing onboarding demos (`zenith demo list`, `zenith demo show continuity`)
- viewing self-tracking telemetry (`zenith standup/diff/drift/adherence/activity`)
- sequencing plan phases with dependencies (`dependsOn` via `plan update-phase`; `plan next` reports `Blocked by dependency` when gated)

Use the zenith-pr-review skill at .claude/skills/zenith-pr-review/SKILL.md when:
- reviewing a PR, MR, branch, diff, staged changes, committed changes, or pre-merge changes
- checking whether code is safe to merge
- synthesizing existing PR comments with fresh review passes
- recording validated actionable review findings into Zenith context

Use the zenith-multi-agent skill at .claude/skills/zenith-multi-agent/SKILL.md when:
- designing or debugging the shared wake-on-event choreography protocol
- coordinating non-standard role handoffs beyond planner/implementer/reviewer
- checking `stage/watch` vocabulary, scope rules, timeouts, and provider-CLI boundaries

Use the zenith-planner skill at .claude/skills/zenith-planner/SKILL.md when:
- turning roadmap direction into executable plans for role-based handoffs
- inspecting `continue`, `plan next`, and `phase show` before dispatch
- setting `stage=implement` for the implementer after the plan/phase is ready

Use the zenith-implementer skill at .claude/skills/zenith-implementer/SKILL.md when:
- waiting for `stage=implement` and implementing the scoped phase
- inspecting `zenith diff --json` and `zenith phase show <phase-id> --json` after wake
- verifying work and setting `stage=review` for the reviewer

Use the zenith-reviewer skill at .claude/skills/zenith-reviewer/SKILL.md when:
- waiting for `stage=review` and reviewing the implementer's handoff
- recording actionable findings with related plan/phase ids
- advancing the phase with `zenith plan advance --json --input -` only after clean review

Before planning:
- Run `zenith continue`.
- Run `zenith prompt --format codex --max-tokens 800` when a compact handoff prompt is useful.
- Run `zenith context compact --json` and `zenith plan next --json` only when you need exact fields for dispatch.
- If structured output returns a `phaseId`, run `zenith phase show <phase-id> --json`.
- If `plan next` recommends a roadmap item and no active plan exists, use `zenith roadmap create-plan <roadmap-id> --json --input -`.
- If `plan next` recommends deferred roadmap work, reactivate the item before creating an executable plan.

Prefer compact markdown commands for normal handoff. Use `zenith ... --json` and `--input -` for machine-readable commands.
Use `plan` only for executable phased work. Use `brief`, `roadmap`, or `spike` for non-executable guidance context.
Use `bun run zenith ...` from this source checkout if the `zenith` binary is not on PATH.
Do not store secrets, full diffs, or long transcripts in Zenith.
<!-- END ZENITH CLI -->
