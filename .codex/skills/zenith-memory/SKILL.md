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
- `context_doc`: pinned or ignored documentation anchor for project, plan, or phase context.
- `tag`: normalized labels attached to memory entities for deterministic discovery.

## Core Rules

- Treat `zenith continue` as the default first command for resuming work.
- Use `zenith handoff --to planner|implementer|reviewer --compact` when an explicit role handoff is needed. Use `zenith agent prompt --format markdown|agent|codex|claude` for raw prompt rendering.
- Treat `zenith plan next --json` as the lower-level source for exact implementation fields.
- If the user's request conflicts with `plan next`, report the conflict and ask for confirmation before implementing.
- Always inspect the target phase with `zenith plan phase show <phase-id> --json` when a phase id is available.
- When `plan next` recommends a roadmap item and no active plan exists, use `zenith roadmap create-plan <roadmap-id> --json --input -` to preserve source links.
- Deferred roadmap items are parked backlog; reactivate them with `roadmap update-item` before creating executable plans.
- Use `plan` only for executable phased work; use `memory brief`, `roadmap`, or `memory spike` for non-executable memory.
- Prefer `zenith ...`; use `bun run zenith ...` in this source repo if the binary is unavailable.
- Never update Zenith memory with SQL, ad hoc file edits, or repo-local state.
- Never store secrets, full diffs, or long transcripts in Zenith.
- Use `zenith report timeline` (with optional `--limit <n>` and `--since <eventId|iso>`) for a read-only view of recent project activity.
- Use `zenith report roi` to report deterministic context compression and continuity signals.
- Use `zenith demo list` and `zenith demo show continuity` when a read-only onboarding or proof workflow is needed.
- Use `zenith session checkpoint`, `zenith session note`, `zenith decision record`, `zenith plan ready`, `zenith plan done`, and `zenith finding record` only when explicit memory mutation is intended.
- Use `zenith session checkpoint --from-git` for a read-only checkpoint draft and `zenith session checkpoint --from-git --save` when the draft should become a session.
- Use `zenith docs suggest --task current` read-only, then `zenith docs pin|ignore <path> --task current` only when doc anchors should be persisted.
- Use `zenith benchmark ...` to list scenarios, export benchmark tasks, record strict local run metadata, and compare variants.
- Use `zenith report standup`, `zenith report diff`, `zenith report drift`, `zenith report adherence`, and `zenith report activity` for read-only self-tracking telemetry when auditing progress or resuming work.
- Use `zenith search --json --query <text>` and `zenith tag list --json` to discover existing memory before creating duplicate records.
- Phase prerequisites are expressed with `dependsOn` (array of phase ids) via `plan update-phase`; when all remaining phases are gated, `plan next` reports `Blocked by dependency`.
- Use `plan next` `kind` field to dispatch in agent loops: `implement_phase` → implement; `review_phase` → review; `blocking_finding | ambiguous_focus | blocked_dependency | review_finding | review_deferred | create_plan_empty` → STOP.
- Use `zenith plan ready --evidence "..."` after implementation is verified but before review; it marks the phase `needs_review` and sets `stage=review`.
- Use `zenith plan advance --json --input -` or `zenith plan done` only after clean review to mark a phase done, append evidence, and recompute the next step.
- Use `zenith plan complete <plan-id> --json` to close a completed plan and advance its source roadmap item.
- Use `zenith plan path <plan-id> --json` to view topological phase order with dependency and readiness information.
- When a plan has independent phases, use `zenith plan dispatchables [plan-id] --json` to list every phase that can run in parallel now, and `zenith dispatch [plan-id] --json [--claim] [--format conductor]` to emit a per-phase handoff prompt for each parallel agent session; serialize the converging `plan advance` / `plan done` transitions in the planning session.
- After verified implementation work, inspect the git status and propose committing the completed change set so future Zenith context does not remain dirty. Do not commit without user confirmation.

## Workflow

1. Read current project context and continuity readiness:
   `zenith continue`
2. Render compact handoff context when needed:
   `zenith handoff --to implementer --compact`
3. Read lower-level project context when exact fields are needed:
   `zenith context compact --json`
4. Ask Zenith what should happen next:
   `zenith plan next --json`
   Use `zenith plan next --json --stale-after-days <n>` when stale-work metadata matters.
5. If a phase id is returned, inspect it:
   `zenith plan phase show <phase-id> --json`
6. Suggest or anchor relevant docs when task context is unclear:
   `zenith docs suggest --task current`
   `zenith docs pin <path> --task current`
   `zenith docs ignore <path> --task current`
7. For non-executable memory, use the right category:
   `zenith memory brief set --json --input -`
   `zenith roadmap create --json --input -`
   `zenith memory spike create --json --input -`
   `zenith memory spike record --json --input -`
8. Convert historical roadmap-like plans explicitly when needed:
   `zenith roadmap import-plan <plan-id> --json --input -`
9. Implement the requested or recommended phase.
10. Verify the work:
   `bun x tsc --noEmit`
   `bun test`
   `bun run build`
11. Mark implementation ready for review with evidence:
   `zenith plan ready --plan <plan-id> --phase <phase-id> --evidence "Verification passed"`
12. Save new executable multi-phase plans with:
   `zenith plan create --json --input -`
13. Update plan metadata with:
   `zenith plan update <plan-id> --json --input -`
14. Record architectural decisions:
   `zenith decision record "Decision title" --context "..." --decision "..."`
15. Record findings or session lifecycle when needed:
   `zenith session checkpoint --from-git`
   `zenith session checkpoint --from-git --save --summary "Summary" --next "Next step"`
   `zenith session checkpoint "Summary" --next "Next step"`
   `zenith session note "Short note"`
   `zenith finding record "Blocked by ..." --description "..." --plan <plan-id> --phase <phase-id>`
   `zenith plan done`
   `zenith finding record --json --input -`
   `zenith finding close <finding-id> --evidence "Reviewed" --json`
   `zenith session start --json --input -`
   `zenith session capture <session-id> --json --input -`
   `zenith session end <session-id> --json --input -`
16. For quick compatibility summaries, use:
   `zenith session summarize --json --input -`
17. Before closing the turn, check git status and propose committing the completed change set if the worktree is dirty.

## References

- `references/cli-reference.md`
- `references/workflows.md`

Generated for codex.
