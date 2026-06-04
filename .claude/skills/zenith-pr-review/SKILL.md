---
name: zenith-pr-review
description: Use when reviewing a PR, MR, diff, branch, staged changes, committed changes, or pre-merge code changes in a Zenith project; orchestrates focused review passes and records validated actionable findings in Zenith memory.
---

# Zenith PR Review

Use this skill to review a pull request, merge request, branch, local diff, staged change set, or committed change set. It adapts the PR review orchestrator workflow for Zenith projects: gather one shared snapshot, run focused review passes, synthesize findings, then record only validated actionable issues in Zenith memory.

This skill reviews; it does not implement fixes unless the user explicitly asks for follow-up implementation.

## Core Workflow

1. Read Zenith context first:
   - `zenith context compact --json`
   - `zenith plan next --json`
   - `zenith finding list --status all --json`
   - `zenith decision list --json`
   - Optional when useful: `zenith diff --json`, `zenith timeline --json --since <cursor>`, `zenith standup --json`
2. Put the reviewed code on disk safely. Local staged/branch diffs can use the current checkout. Remote PRs should use a temporary worktree at the PR head when possible so surrounding file reads match the diff.
3. Gather shared review context once: base/head SHAs, diff, PR description or commit messages, touched modules, project conventions, and relevant surrounding code.
4. Run focused review passes. Scale to the change size: small patches usually need correctness plus docs/consistency; larger features/refactors should use all relevant passes.
5. Synthesize, do not concatenate. Stress-test blocker and should-fix findings, deduplicate overlapping concerns, resolve reviewer conflicts, and prioritize by severity.
6. Record only validated actionable findings in Zenith with `zenith finding record --json --input -`. Do not record nits, speculative concerns, full diffs, secrets, or long transcripts.

## Review Pass References

Read only the reference files needed for the current review:

- Correctness and bugs: `references/correctness.md`
- Simplification: `references/simplification.md`
- Docs and convention compliance: `references/docs-compliance.md`
- Design quality: `references/design-quality.md`
- Consistency and API surface: `references/consistency.md`
- Existing PR comments: `references/pr-comments.md`
- Resolving addressed threads after fixes: `references/post-fix-resolution.md`

## Finding Recording

Use existing Zenith finding types:

- `bug`: correctness, regression, error handling, data integrity, security footgun
- `risk`: operational, release, compatibility, or uncertainty that can cause harm
- `tech_debt`: maintainability issue with concrete cost
- `architecture`: boundary, coupling, cohesion, or design issue with a concrete consequence
- `docs_gap`: missing or stale required docs/convention updates
- `test_gap`: missing tests for behavior that should be covered
- `simplification`: unnecessary complexity, dead code, duplicate logic, premature abstraction

Map review severity to Zenith severity conservatively:

- Review blocker -> `critical` or `high`
- Review should-fix -> `medium` or `high`
- Review nit -> do not record unless the user explicitly asks to track it

When an active plan or phase is relevant, include `relatedPlanId` and `relatedPhaseId` in the finding payload. Keep descriptions concise and actionable.

## Output Shape

Lead with findings, ordered by severity. Use this structure:

```
## PR Review: <title or branch>

Verdict: <Approve / Approve with nits / Request changes / Blocked>
Scope reviewed: <N files, subsystems, base..head>

### Blockers
<must-fix findings or "None">

### Should Fix
<worth addressing before merge>

### Nits And Suggestions
<minor optional issues>

### Design Notes
<judgment-call structure observations>

### Convention Compliance
<docs/convention status and deviations>

### Existing PR Comments
<only for real PRs with comments to triage>
```

Each finding should be concrete: `file:line - problem - consequence - suggested fix or question`. If the reviewed change is clean, say so directly and do not invent concerns.

Generated for claude.
