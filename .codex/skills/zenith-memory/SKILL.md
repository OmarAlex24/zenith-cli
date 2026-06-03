---
name: zenith-memory
description: Use when working in a repository that uses Zenith CLI to read local project context, continue previous work, maintain briefs/roadmaps/spikes, update executable plan progress, record findings/decisions, and manage sessions.
---

# Zenith Memory

Use this skill when the user asks to plan, resume, record project intent, maintain roadmap direction, record research spikes, store technical decisions, record findings, or close a meaningful coding session.

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
- Use `plan` only for executable phased work; use `brief`, `roadmap`, or `spike` for non-executable memory.
- Prefer `zenith ...`; use `bun run zenith ...` in this source repo if the binary is unavailable.
- Never update Zenith memory with SQL, ad hoc file edits, or repo-local state.
- Never store secrets, full diffs, or long transcripts in Zenith.
- After verified implementation work, inspect the git status and propose committing the completed change set so future Zenith context does not remain dirty. Do not commit without user confirmation.

## Workflow

1. Read current project context:
   `zenith context compact --json`
2. Ask Zenith what should happen next:
   `zenith plan next --json`
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

Generated for codex.
