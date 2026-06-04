---
name: zenith-memory
description: Use when working in a repository that uses Zenith CLI to read local project context, continue previous work, maintain briefs/roadmaps/spikes, update executable plan progress, record findings/decisions, and manage sessions.
---

# Zenith Memory

Use this skill when the user asks to plan, resume, record project intent, maintain roadmap direction, record research spikes, store technical decisions, record findings, view self-tracking telemetry, or close a meaningful coding session.

Zenith CLI is the source of truth for private local project memory. It stores data locally, not in the repository.

## Memory Types

- `brief`: why the project exists and its stable product intent.
- `roadmap`: where the project is going by milestones or capabilities.
- `plan`: executable work being done now by phases.
- `spike`: bounded investigation done to reduce uncertainty.
- `decision`: technical or strategic choice.
- `finding`: bug, risk, debt, or gap.
- `session`: work continuity log.

## Core Rules

- Treat `zenith plan next --json` as the default source for what to implement next.
- If the user's request conflicts with `plan next`, report the conflict and ask for confirmation before implementing.
- Always inspect the target phase with `zenith phase show <phase-id> --json` when a phase id is available.
- When `plan next` recommends a roadmap item and no active plan exists, use `zenith roadmap create-plan <roadmap-id> --json --input -` to preserve source links.
- Deferred roadmap items are parked backlog; reactivate them with `roadmap update-item` before creating executable plans.
- Use `plan` only for executable phased work; use `brief`, `roadmap`, or `spike` for non-executable memory.
- Prefer `zenith ...`; use `bun run zenith ...` in this source repo if the binary is unavailable.
- Never update Zenith memory with SQL, ad hoc file edits, or repo-local state.
- Never store secrets, full diffs, or long transcripts in Zenith.
- Use `zenith timeline --json` (with optional `--limit <n>` and `--since <eventId|iso>`) for a read-only view of recent project activity.
- Use `zenith standup --json`, `zenith diff --json`, `zenith drift --json`, `zenith adherence --json`, and `zenith activity --json` for read-only self-tracking telemetry when auditing progress or resuming work.
- Phase prerequisites are expressed with `dependsOn` (array of phase ids) via `plan update-phase`; when all remaining phases are gated, `plan next` reports `Blocked by dependency`.
- Use `plan next` `kind` field to dispatch in agent loops: `implement_phase` → implement; `blocking_finding | ambiguous_focus | blocked_dependency | review_finding | review_deferred | create_plan_empty` → STOP.
- Use `zenith plan advance --json --input -` to mark a phase done, append evidence, and recompute the next step in one command (each step transactional).
- Use `zenith plan complete <plan-id> --json` to close a completed plan and advance its source roadmap item.
- Use `zenith plan path <plan-id> --json` to view topological phase order with dependency and readiness information.
- After verified implementation work, inspect the git status and propose committing the completed change set so future Zenith context does not remain dirty. Do not commit without user confirmation.

## Workflow

1. Read current project context:
   `zenith context compact --json`
2. Ask Zenith what should happen next:
   `zenith plan next --json`
   Use `zenith plan next --json --stale-after-days <n>` when stale-work metadata matters.
3. If a phase id is returned, inspect it:
   `zenith phase show <phase-id> --json`
4. For non-executable memory, use the right category:
   `zenith brief set --json --input -`
   `zenith roadmap create --json --input -`
   `zenith spike create --json --input -`
   `zenith spike record --json --input -`
5. Convert historical roadmap-like plans explicitly when needed:
   `zenith roadmap import-plan <plan-id> --json --input -`
6. Implement the requested or recommended phase.
7. Verify the work:
   `bun x tsc --noEmit`
   `bun test`
   `bun run build`
8. Update completed phases with evidence:
   `zenith plan update-phase <plan-id> --json --input -`
9. Save new executable multi-phase plans with:
   `zenith plan create --json --input -`
10. Update plan metadata with:
   `zenith plan update <plan-id> --json --input -`
11. Record architectural decisions:
   `zenith decision record --json --input -`
12. Record findings or session lifecycle when needed:
   `zenith finding record --json --input -`
   `zenith finding close <finding-id> --json`
   `zenith session start --json --input -`
   `zenith session capture <session-id> --json --input -`
   `zenith session end <session-id> --json --input -`
13. For quick compatibility summaries, use:
   `zenith session summarize --json --input -`
14. Before closing the turn, check git status and propose committing the completed change set if the worktree is dirty.

## References

- `references/cli-reference.md`
- `references/workflows.md`

Generated for claude.
