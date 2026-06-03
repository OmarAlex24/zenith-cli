<!-- BEGIN ZENITH CLI -->
# Zenith Memory

This repository uses Zenith CLI as private local project memory.

Use the zenith-memory skill at .codex/skills/zenith-memory/SKILL.md when:
- recording the project brief or long-running roadmap
- creating implementation plans
- recording bounded research spikes
- continuing previous work
- updating project progress
- recording technical decisions
- recording and closing findings
- starting, capturing, ending, or summarizing a coding session

Before planning:
- Run `zenith context compact --json`.
- Run `zenith plan next --json`.
- If `plan next` returns a `phaseId`, run `zenith phase show <phase-id> --json`.
- If `plan next` recommends a roadmap item and no active plan exists, use `zenith roadmap create-plan <roadmap-id> --json --input -`.
- If `plan next` recommends deferred roadmap work, reactivate the item before creating an executable plan.

Prefer `zenith ... --json` and `--input -` for machine-readable commands.
Use `plan` only for executable phased work. Use `brief`, `roadmap`, or `spike` for non-executable memory.
Use `bun run zenith ...` from this source checkout if the `zenith` binary is not on PATH.
Use `decode` only as a legacy alias when `zenith` is unavailable.
Do not store secrets, full diffs, or long transcripts in Zenith.
<!-- END ZENITH CLI -->
