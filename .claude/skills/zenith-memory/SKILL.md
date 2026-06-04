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
- `tag`: normalized labels attached to memory entities for deterministic discovery.

## Core Rules

- Treat `zenith continue` as the default first command for resuming work.
- Use `zenith prompt --format codex --max-tokens 800`, `--format claude`, `--format agent`, or `--format markdown` when a compact copyable prompt is needed.
- Treat `zenith plan next --json` as the lower-level source for exact implementation fields.
- If the user's request conflicts with `plan next`, report the conflict and ask for confirmation before implementing.
- Always inspect the target phase with `zenith phase show <phase-id> --json` when a phase id is available.
- When `plan next` recommends a roadmap item and no active plan exists, use `zenith roadmap create-plan <roadmap-id> --json --input -` to preserve source links.
- Deferred roadmap items are parked backlog; reactivate them with `roadmap update-item` before creating executable plans.
- Use `plan` only for executable phased work; use `brief`, `roadmap`, or `spike` for non-executable memory.
- Prefer `zenith ...`; use `bun run zenith ...` in this source repo if the binary is unavailable.
- Never update Zenith memory with SQL, ad hoc file edits, or repo-local state.
- Never store secrets, full diffs, or long transcripts in Zenith.
- Use `zenith timeline` (with optional `--limit <n>` and `--since <eventId|iso>`) for a read-only view of recent project activity.
- Use `zenith roi` to report deterministic context compression and continuity signals.
- Use `zenith demo list` and `zenith demo show continuity` when a read-only onboarding or proof workflow is needed.
- Use `zenith checkpoint`, `zenith note`, `zenith decide`, `zenith done`, and `zenith blocked` only when explicit memory mutation is intended.
- Use `zenith benchmark ...` to list scenarios, export benchmark tasks, record strict local run metadata, and compare variants.
- Use `zenith standup`, `zenith diff`, `zenith drift`, `zenith adherence`, and `zenith activity` for read-only self-tracking telemetry when auditing progress or resuming work.
- Use `zenith search --json --query <text>` and `zenith tag list --json` to discover existing memory before creating duplicate records.
- Phase prerequisites are expressed with `dependsOn` (array of phase ids) via `plan update-phase`; when all remaining phases are gated, `plan next` reports `Blocked by dependency`.
- Use `plan next` `kind` field to dispatch in agent loops: `implement_phase` → implement; `blocking_finding | ambiguous_focus | blocked_dependency | review_finding | review_deferred | create_plan_empty` → STOP.
- Use `zenith plan advance --json --input -` to mark a phase done, append evidence, and recompute the next step in one command (each step transactional).
- Use `zenith plan complete <plan-id> --json` to close a completed plan and advance its source roadmap item.
- Use `zenith plan path <plan-id> --json` to view topological phase order with dependency and readiness information.
- After verified implementation work, inspect the git status and propose committing the completed change set so future Zenith context does not remain dirty. Do not commit without user confirmation.

## Workflow

1. Read current project context and continuity readiness:
   `zenith continue`
2. Render compact handoff context when needed:
   `zenith prompt --format codex --max-tokens 800`
3. Read lower-level project context when exact fields are needed:
   `zenith context compact --json`
4. Ask Zenith what should happen next:
   `zenith plan next --json`
   Use `zenith plan next --json --stale-after-days <n>` when stale-work metadata matters.
5. If a phase id is returned, inspect it:
   `zenith phase show <phase-id> --json`
6. For non-executable memory, use the right category:
   `zenith brief set --json --input -`
   `zenith roadmap create --json --input -`
   `zenith spike create --json --input -`
   `zenith spike record --json --input -`
7. Convert historical roadmap-like plans explicitly when needed:
   `zenith roadmap import-plan <plan-id> --json --input -`
8. Implement the requested or recommended phase.
9. Verify the work:
   `bun x tsc --noEmit`
   `bun test`
   `bun run build`
10. Update completed phases with evidence:
   `zenith plan update-phase <plan-id> --json --input -`
11. Save new executable multi-phase plans with:
   `zenith plan create --json --input -`
12. Update plan metadata with:
   `zenith plan update <plan-id> --json --input -`
13. Record architectural decisions:
   `zenith decide "Decision title" --context "..." --decision "..."`
14. Record findings or session lifecycle when needed:
   `zenith checkpoint "Summary" --next "Next step"`
   `zenith note "Short note"`
   `zenith blocked "Blocked by ..." --description "..." --plan <plan-id> --phase <phase-id>`
   `zenith done`
   `zenith finding record --json --input -`
   `zenith finding close <finding-id> --json`
   `zenith session start --json --input -`
   `zenith session capture <session-id> --json --input -`
   `zenith session end <session-id> --json --input -`
15. For quick compatibility summaries, use:
   `zenith session summarize --json --input -`
16. Before closing the turn, check git status and propose committing the completed change set if the worktree is dirty.

## References

- `references/cli-reference.md`
- `references/workflows.md`

Generated for claude.
