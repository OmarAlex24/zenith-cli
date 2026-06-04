import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type AgentKind = "codex" | "claude";

export type AgentInstallResult = {
  agent: AgentKind;
  rootPath: string;
  files: Array<{
    path: string;
    action: "created" | "updated" | "unchanged";
  }>;
};

const START_MARKER = "<!-- BEGIN ZENITH CLI -->";
const END_MARKER = "<!-- END ZENITH CLI -->";
const LEGACY_START_MARKER = "<!-- BEGIN DECODE CLI -->";
const LEGACY_END_MARKER = "<!-- END DECODE CLI -->";

export function installAgentPack(agent: AgentKind, rootPath: string): AgentInstallResult {
  const files: AgentInstallResult["files"] = [];
  const rootFile = agent === "codex" ? "AGENTS.md" : "CLAUDE.md";
  const rootFilePath = join(rootPath, rootFile);
  const skillRoot = agent === "codex" ? ".codex" : ".claude";
  const skillsDir = join(rootPath, skillRoot, "skills");
  const memorySkillDir = join(skillsDir, "zenith-memory");
  const reviewSkillDir = join(skillsDir, "zenith-pr-review");

  files.push(writeMarkedFile(rootFilePath, rootInstructions(agent)));

  mkdirSync(join(memorySkillDir, "references"), { recursive: true });
  files.push(writeCompleteFile(join(memorySkillDir, "SKILL.md"), skillTemplate(agent)));
  files.push(writeCompleteFile(join(memorySkillDir, "references", "cli-reference.md"), cliReferenceTemplate()));
  files.push(writeCompleteFile(join(memorySkillDir, "references", "workflows.md"), workflowsTemplate()));

  mkdirSync(join(reviewSkillDir, "references"), { recursive: true });
  files.push(writeCompleteFile(join(reviewSkillDir, "SKILL.md"), prReviewSkillTemplate(agent)));
  for (const reference of prReviewReferenceTemplates()) {
    files.push(writeCompleteFile(join(reviewSkillDir, "references", reference.file), reference.content));
  }

  return { agent, rootPath, files };
}

function writeMarkedFile(path: string, blockBody: string): AgentInstallResult["files"][number] {
  const nextBlock = `${START_MARKER}\n${blockBody.trim()}\n${END_MARKER}`;
  const existed = existsSync(path);
  const previous = existed ? readFileSync(path, "utf8") : "";
  const next = mergeMarkedBlock(previous, nextBlock);

  if (previous === next) {
    return { path, action: "unchanged" };
  }

  writeFileSync(path, next, "utf8");
  return { path, action: existed ? "updated" : "created" };
}

function writeCompleteFile(path: string, content: string): AgentInstallResult["files"][number] {
  const existed = existsSync(path);
  const next = content.trimEnd() + "\n";
  const previous = existed ? readFileSync(path, "utf8") : null;

  if (previous === next) {
    return { path, action: "unchanged" };
  }

  writeFileSync(path, next, "utf8");
  return { path, action: existed ? "updated" : "created" };
}

function mergeMarkedBlock(previous: string, nextBlock: string): string {
  const current = findMarkedBlock(previous, START_MARKER, END_MARKER) ?? findMarkedBlock(previous, LEGACY_START_MARKER, LEGACY_END_MARKER);

  if (current) {
    const before = previous.slice(0, current.start).trimEnd();
    const after = previous.slice(current.end + current.endMarker.length).trimStart();
    return [before, nextBlock, after].filter(Boolean).join("\n\n") + "\n";
  }

  if (previous.trim().length === 0) {
    return `${nextBlock}\n`;
  }

  return `${previous.trimEnd()}\n\n${nextBlock}\n`;
}

function findMarkedBlock(previous: string, startMarker: string, endMarker: string): { start: number; end: number; endMarker: string } | null {
  const start = previous.indexOf(startMarker);
  const end = previous.indexOf(endMarker);
  return start !== -1 && end !== -1 && end > start ? { start, end, endMarker } : null;
}

function rootInstructions(agent: AgentKind): string {
  const memorySkillPath = agent === "codex" ? ".codex/skills/zenith-memory/SKILL.md" : ".claude/skills/zenith-memory/SKILL.md";
  const reviewSkillPath = agent === "codex" ? ".codex/skills/zenith-pr-review/SKILL.md" : ".claude/skills/zenith-pr-review/SKILL.md";

  return `
# Zenith Memory

This repository uses Zenith CLI as private local project memory.

Use the zenith-memory skill at ${memorySkillPath} when:
- recording the project brief or long-running roadmap
- creating implementation plans
- recording bounded research spikes
- continuing previous work
- updating project progress
- recording technical decisions
- recording and closing findings
- starting, capturing, ending, or summarizing a coding session
- viewing recent project activity (\`zenith timeline --json\`)
- viewing self-tracking telemetry (\`zenith standup/diff/drift/adherence --json\`)
- sequencing plan phases with dependencies (\`dependsOn\` via \`plan update-phase\`; \`plan next\` reports \`Blocked by dependency\` when gated)

Use the zenith-pr-review skill at ${reviewSkillPath} when:
- reviewing a PR, MR, branch, diff, staged changes, committed changes, or pre-merge changes
- checking whether code is safe to merge
- synthesizing existing PR comments with fresh review passes
- recording validated actionable review findings into Zenith memory

Before planning:
- Run \`zenith context compact --json\`.
- Run \`zenith plan next --json\`.
- If \`plan next\` returns a \`phaseId\`, run \`zenith phase show <phase-id> --json\`.
- If \`plan next\` recommends a roadmap item and no active plan exists, use \`zenith roadmap create-plan <roadmap-id> --json --input -\`.
- If \`plan next\` recommends deferred roadmap work, reactivate the item before creating an executable plan.

Prefer \`zenith ... --json\` and \`--input -\` for machine-readable commands.
Use \`plan\` only for executable phased work. Use \`brief\`, \`roadmap\`, or \`spike\` for non-executable memory.
Use \`bun run zenith ...\` from this source checkout if the \`zenith\` binary is not on PATH.
Use \`decode\` only as a legacy alias when \`zenith\` is unavailable.
Do not store secrets, full diffs, or long transcripts in Zenith.
`;
}

function prReviewSkillTemplate(agent: AgentKind): string {
  return `---
name: zenith-pr-review
description: Use when reviewing a PR, MR, diff, branch, staged changes, committed changes, or pre-merge code changes in a Zenith project; orchestrates focused review passes and records validated actionable findings in Zenith memory.
---

# Zenith PR Review

Use this skill to review a pull request, merge request, branch, local diff, staged change set, or committed change set. It adapts the PR review orchestrator workflow for Zenith projects: gather one shared snapshot, run focused review passes, synthesize findings, then record only validated actionable issues in Zenith memory.

This skill reviews; it does not implement fixes unless the user explicitly asks for follow-up implementation.

## Core Workflow

1. Read Zenith context first:
   - \`zenith context compact --json\`
   - \`zenith plan next --json\`
   - \`zenith finding list --status all --json\`
   - \`zenith decision list --json\`
   - Optional when useful: \`zenith diff --json\`, \`zenith timeline --json --since <cursor>\`, \`zenith standup --json\`
2. Put the reviewed code on disk safely. Local staged/branch diffs can use the current checkout. Remote PRs should use a temporary worktree at the PR head when possible so surrounding file reads match the diff.
3. Gather shared review context once: base/head SHAs, diff, PR description or commit messages, touched modules, project conventions, and relevant surrounding code.
4. Run focused review passes. Scale to the change size: small patches usually need correctness plus docs/consistency; larger features/refactors should use all relevant passes.
5. Synthesize, do not concatenate. Stress-test blocker and should-fix findings, deduplicate overlapping concerns, resolve reviewer conflicts, and prioritize by severity.
6. Record only validated actionable findings in Zenith with \`zenith finding record --json --input -\`. Do not record nits, speculative concerns, full diffs, secrets, or long transcripts.

## Review Pass References

Read only the reference files needed for the current review:

- Correctness and bugs: \`references/correctness.md\`
- Simplification: \`references/simplification.md\`
- Docs and convention compliance: \`references/docs-compliance.md\`
- Design quality: \`references/design-quality.md\`
- Consistency and API surface: \`references/consistency.md\`
- Existing PR comments: \`references/pr-comments.md\`
- Resolving addressed threads after fixes: \`references/post-fix-resolution.md\`

## Finding Recording

Use existing Zenith finding types:

- \`bug\`: correctness, regression, error handling, data integrity, security footgun
- \`risk\`: operational, release, compatibility, or uncertainty that can cause harm
- \`tech_debt\`: maintainability issue with concrete cost
- \`architecture\`: boundary, coupling, cohesion, or design issue with a concrete consequence
- \`docs_gap\`: missing or stale required docs/convention updates
- \`test_gap\`: missing tests for behavior that should be covered
- \`simplification\`: unnecessary complexity, dead code, duplicate logic, premature abstraction

Map review severity to Zenith severity conservatively:

- Review blocker -> \`critical\` or \`high\`
- Review should-fix -> \`medium\` or \`high\`
- Review nit -> do not record unless the user explicitly asks to track it

When an active plan or phase is relevant, include \`relatedPlanId\` and \`relatedPhaseId\` in the finding payload. Keep descriptions concise and actionable.

## Output Shape

Lead with findings, ordered by severity. Use this structure:

\`\`\`
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
\`\`\`

Each finding should be concrete: \`file:line - problem - consequence - suggested fix or question\`. If the reviewed change is clean, say so directly and do not invent concerns.

Generated for ${agent}.
`;
}

type PrReviewReference = {
  file: string;
  content: string;
};

function prReviewReferenceTemplates(): PrReviewReference[] {
  return [
    { file: "correctness.md", content: prReviewCorrectnessTemplate() },
    { file: "simplification.md", content: prReviewSimplificationTemplate() },
    { file: "docs-compliance.md", content: prReviewDocsComplianceTemplate() },
    { file: "design-quality.md", content: prReviewDesignQualityTemplate() },
    { file: "consistency.md", content: prReviewConsistencyTemplate() },
    { file: "pr-comments.md", content: prReviewCommentsTemplate() },
    { file: "post-fix-resolution.md", content: prReviewPostFixResolutionTemplate() },
  ];
}

function prReviewCorrectnessTemplate(): string {
  return `
# Reviewer Mandate: Correctness And Bugs

Review for correctness only. Ignore style, architecture, and elegance unless they directly cause broken behavior. The question is: will this code do the wrong thing, break, corrupt data, or create an exploitable path for some realistic input or runtime state?

## Hunt For

- Logic errors: off-by-one, inverted condition, wrong operator, swapped arguments, incorrect boolean short-circuit.
- Edge cases: empty input, null/undefined, zero, negative values, single item, large input, unicode, timezones, DST, leap years.
- Error handling: swallowed errors, resources not released, cleanup skipped on failure, unhandled promise rejections.
- State and lifecycle: stale caches, shared mutable state, order assumptions, partial writes, non-atomic check-then-act.
- Data integrity: missing transaction, missing rollback, lossy serialization, unsafe type coercion.
- Security footguns: injection, path traversal, unsafe deserialization, secrets in code/logs, broken authz checks, SSRF.
- Tests: risky paths without tests, tests that assert the wrong behavior, tests that cannot fail.

## How To Work

Read the diff and enough surrounding code to understand the intended contract. Use the PR description or commit messages to identify intent. Trace risky paths by hand and prefer concrete reproductions over broad concerns.

## Output

Return findings as: \`severity - file:line - what breaks and under what condition - suggested fix or question\`.

Use \`blocker\` for security issues, data loss/corruption, or behavior that makes the change unsafe to merge. Use \`should-fix\` for real defects with bounded impact. Use \`nit\` rarely for correctness-adjacent details. If no correctness issues are found, return no findings.
`;
}

function prReviewSimplificationTemplate(): string {
  return `
# Reviewer Mandate: Simplification

Review for ways to make the change simpler without losing correctness or clarity. The question is: what is more complicated than the problem requires?

## Hunt For

- Dead code: unused imports, variables, params, branches, functions, or commented-out blocks.
- Redundancy: duplicated logic or helpers that duplicate standard library, dependencies, or local utilities.
- Over-engineering: speculative abstraction, configuration nobody sets, generic machinery for one concrete use.
- Needless complexity: deep nesting that could be guard clauses, state machines for two states, classes that should be functions.
- Verbosity: many lines saying what fewer lines would say just as clearly.

## Judgment

Simpler is not the same as shorter or cleverer. Do not suggest dense rewrites that make intent harder to read. Only recommend abstractions when there is a concrete present second use or a documented near-term need.

## Output

Return findings as: \`severity - file:line - what is more complex than needed - simpler version\`.

Simplification findings are usually \`should-fix\` or \`nit\`, not blockers. If the change is already lean, return no findings.
`;
}

function prReviewDocsComplianceTemplate(): string {
  return `
# Reviewer Mandate: Docs And Convention Compliance

Review whether the change follows the project's documented conventions and architecture, and whether deviations are justified.

## Sources Of Truth

Check the relevant sources for the touched code:

- \`AGENTS.md\`, \`CLAUDE.md\`
- \`CONTRIBUTING.md\`, lint/type configs, style guides
- \`docs/\`, ADRs, RFCs, decisions
- READMEs in touched directories
- Established neighboring code patterns when docs are silent
- Zenith decisions from \`zenith decision list --json\` and \`zenith decision show <id> --json\` when relevant

## Check

- Naming, structure, file placement, and module boundaries.
- Error handling, logging, config, migration, test, and documentation patterns.
- Whether new public behavior, commands, env vars, or user-facing workflows are documented where this project expects them to be.
- Whether a deviation has a justification in PR text, code comments, docs, ADRs, or Zenith decisions.

If docs are stale and code is following the healthier current pattern, the finding should be to update docs, not blindly revert code.

## Output

Return findings as: \`severity - file:line or doc reference - convention involved - deviation and required justification or update\`.

If the change complies or all deviations are justified, return no findings.
`;
}

function prReviewDesignQualityTemplate(): string {
  return `
# Reviewer Mandate: Design Quality

Review software design quality: the structural properties that determine how easy the code is to change, test, and reason about later. Do not duplicate the correctness pass.

## Assess

- Coupling: concrete dependencies where a narrow interface is needed, circular dependencies, provider/vendor details leaking into policy code.
- Cohesion: modules or functions mixing unrelated responsibilities.
- Abstraction: leaky, premature, too generic, too specific, or missing boundaries that block testing or change.
- Separation of concerns: business logic, I/O, persistence, presentation, config, and orchestration belong in appropriate places.
- Design patterns: useful when they solve a present problem; harmful when they add indirection without value.

## Judgment

Tie each design concern to a concrete cost in this codebase. "Violates DIP" is not useful. "This instantiates the network client inside business logic, so tests need live network and provider swaps require editing policy code" is useful.

Design issues are usually \`should-fix\` or design notes. Use \`blocker\` only when structure makes the change unsafe to merge.

## Output

Return findings as: \`severity - file:line - structural issue - concrete consequence - suggested direction\`.

Separate defects from judgment calls. If the design is sound, return no findings.
`;
}

function prReviewConsistencyTemplate(): string {
  return `
# Reviewer Mandate: Consistency And API Surface

Review whether the change fits the surrounding codebase and whether it changes contracts that others depend on.

## Consistency

Check local conventions for:

- Naming and vocabulary.
- Error and return style.
- Module structure, imports, exports, and test placement.
- Existing helpers and dependencies.
- Validation, logging, config, and serialization patterns.

The bar is consistency with this codebase, not personal preference.

## API Surface

Identify additions, removals, or behavior changes in:

- Public functions, methods, types, schemas, and enum values.
- CLI commands, options, JSON envelopes, and output shapes.
- Events, database schema, config, and env vars.
- User-facing generated files or agent workflows.

For each surface change, ask whether it is backward compatible and whether the change is documented or intentionally called out.

## Output

Return findings as: \`severity - file:line - inconsistency or contract change - expected convention or compatibility action\`.

If the change is consistent and has no surprising surface changes, return no findings.
`;
}

function prReviewCommentsTemplate(): string {
  return `
# Reviewer Mandate: Existing PR Comments

Triage comments already on a real PR. Do not review the code itself in this pass; other passes do that. The goal is to keep unresolved actionable human and bot feedback from getting lost.

## Fetch

Use the platform CLI when available. For GitHub:

- \`gh pr view <n> --comments\`
- \`gh api repos/{owner}/{repo}/pulls/<n>/comments --paginate\`
- \`gh api repos/{owner}/{repo}/pulls/<n>/reviews --paginate\`
- GraphQL review threads for resolved/unresolved state

If there is no real PR or the platform CLI is unavailable, return no findings for this pass.

## Triage

- Keep comments that point to real defects or reasonable concerns.
- Drop greetings, summaries, duplicate bot noise, stale comments, and resolved threads.
- Verify comments against the current PR head, not the old code where the comment was created.
- Deduplicate against findings from other passes.
- Judge bot comments; do not relay unverified suggestions as facts.

## Output

Return findings as: \`source - severity - file:line if anchored - comment summary - your call\`.

Mention only surviving actionable comments. A brief skipped-count summary is enough for noise.
`;
}

function prReviewPostFixResolutionTemplate(): string {
  return `
# Post-fix: Resolve Addressed PR Review Threads

Use this only after fixes have been committed and pushed to the PR head branch. Review threads should be resolved only when the feedback is fully addressed.

## Preconditions

- \`gh\` is installed and authenticated.
- You have write access to the PR.
- Fixes are already pushed to the PR's real head branch.
- You have inspected each thread individually.

## GitHub Flow

1. Identify owner, repo, and PR number:
   \`gh pr view <n> --json number,url\`
2. Fetch unresolved review threads with GraphQL \`reviewThreads\`, including \`id\`, \`isResolved\`, \`isOutdated\`, \`path\`, \`line\`, and recent comments.
3. Match each unresolved thread to the fix. Resolve only if the same concern is fully handled and no follow-up remains.
4. Resolve one thread at a time with GraphQL \`resolveReviewThread(input: { threadId })\`.
5. Re-fetch threads and verify only intended threads were resolved.

## Safety Rules

- Never bulk-resolve without per-thread inspection.
- Leave partial, unclear, contested, or still-relevant threads open.
- If permissions or GraphQL fail, report that instead of silently continuing.
- If unsure, leave the thread open and explain the status.
`;
}

function skillTemplate(agent: AgentKind): string {
  return `---
name: zenith-memory
description: Use when working in a repository that uses Zenith CLI to read local project context, continue previous work, maintain briefs/roadmaps/spikes, update executable plan progress, record findings/decisions, and manage sessions.
---

# Zenith Memory

Use this skill when the user asks to plan, resume, record project intent, maintain roadmap direction, record research spikes, store technical decisions, record findings, view self-tracking telemetry, or close a meaningful coding session.

Zenith CLI is the source of truth for private local project memory. It stores data locally, not in the repository.

## Memory Types

- \`brief\`: why the project exists and its stable product intent.
- \`roadmap\`: where the project is going by milestones or capabilities.
- \`plan\`: executable work being done now by phases.
- \`spike\`: bounded investigation done to reduce uncertainty.
- \`decision\`: technical or strategic choice.
- \`finding\`: bug, risk, debt, or gap.
- \`session\`: work continuity log.

## Core Rules

- Treat \`zenith plan next --json\` as the default source for what to implement next.
- If the user's request conflicts with \`plan next\`, report the conflict and ask for confirmation before implementing.
- Always inspect the target phase with \`zenith phase show <phase-id> --json\` when a phase id is available.
- When \`plan next\` recommends a roadmap item and no active plan exists, use \`zenith roadmap create-plan <roadmap-id> --json --input -\` to preserve source links.
- Deferred roadmap items are parked backlog; reactivate them with \`roadmap update-item\` before creating executable plans.
- Use \`plan\` only for executable phased work; use \`brief\`, \`roadmap\`, or \`spike\` for non-executable memory.
- Prefer \`zenith ...\`; use \`bun run zenith ...\` in this source repo if the binary is unavailable.
- Never update Zenith memory with SQL, ad hoc file edits, or repo-local state.
- Never store secrets, full diffs, or long transcripts in Zenith.
- Use \`zenith timeline --json\` (with optional \`--limit <n>\` and \`--since <eventId|iso>\`) for a read-only view of recent project activity.
- Use \`zenith standup --json\`, \`zenith diff --json\`, \`zenith drift --json\`, and \`zenith adherence --json\` for read-only self-tracking telemetry when auditing progress or resuming work.
- Phase prerequisites are expressed with \`dependsOn\` (array of phase ids) via \`plan update-phase\`; when all remaining phases are gated, \`plan next\` reports \`Blocked by dependency\`.
- Use \`plan next\` \`kind\` field to dispatch in agent loops: \`implement_phase\` → implement; \`blocking_finding | ambiguous_focus | blocked_dependency | review_finding | review_deferred | create_plan_empty\` → STOP.
- Use \`zenith plan advance --json --input -\` to mark a phase done, append evidence, and recompute the next step in one command (each step transactional).
- Use \`zenith plan complete <plan-id> --json\` to close a completed plan and advance its source roadmap item.
- Use \`zenith plan path <plan-id> --json\` to view topological phase order with dependency and readiness information.
- After verified implementation work, inspect the git status and propose committing the completed change set so future Zenith context does not remain dirty. Do not commit without user confirmation.

## Workflow

1. Read current project context:
   \`zenith context compact --json\`
2. Ask Zenith what should happen next:
   \`zenith plan next --json\`
   Use \`zenith plan next --json --stale-after-days <n>\` when stale-work metadata matters.
3. If a phase id is returned, inspect it:
   \`zenith phase show <phase-id> --json\`
4. For non-executable memory, use the right category:
   \`zenith brief set --json --input -\`
   \`zenith roadmap create --json --input -\`
   \`zenith spike create --json --input -\`
   \`zenith spike record --json --input -\`
5. Convert historical roadmap-like plans explicitly when needed:
   \`zenith roadmap import-plan <plan-id> --json --input -\`
6. Implement the requested or recommended phase.
7. Verify the work:
   \`bun x tsc --noEmit\`
   \`bun test\`
   \`bun run build\`
8. Update completed phases with evidence:
   \`zenith plan update-phase <plan-id> --json --input -\`
9. Save new executable multi-phase plans with:
   \`zenith plan create --json --input -\`
10. Update plan metadata with:
   \`zenith plan update <plan-id> --json --input -\`
11. Record architectural decisions:
   \`zenith decision record --json --input -\`
12. Record findings or session lifecycle when needed:
   \`zenith finding record --json --input -\`
   \`zenith finding close <finding-id> --json\`
   \`zenith session start --json --input -\`
   \`zenith session capture <session-id> --json --input -\`
   \`zenith session end <session-id> --json --input -\`
13. For quick compatibility summaries, use:
   \`zenith session summarize --json --input -\`
14. Before closing the turn, check git status and propose committing the completed change set if the worktree is dirty.

## References

- \`references/cli-reference.md\`
- \`references/workflows.md\`

Generated for ${agent}.
`;
}

function cliReferenceTemplate(): string {
  return `
# Zenith CLI Reference

All agent-facing commands should use \`--json\`.
If the \`zenith\` binary is not on PATH while working inside this source checkout, use \`bun run zenith ...\`.

## Project

- \`zenith init --json\`
- \`zenith project detect --json\`
- \`zenith project status --json\`

## Brief

- \`zenith brief set --json --input -\`
- \`zenith brief show --json\`
- \`zenith brief list --json\`

## Roadmaps

- \`zenith roadmap create --json --input -\`
- \`zenith roadmap list --json\`
- \`zenith roadmap show <roadmap-id> --json\`
- \`zenith roadmap update <roadmap-id> --json --input -\`
- \`zenith roadmap add-item <roadmap-id> --json --input -\`
- \`zenith roadmap update-item <roadmap-id> --json --input -\`
- \`zenith roadmap import-plan <plan-id> --json --input -\`
- \`zenith roadmap create-plan <roadmap-id> --json --input -\`

Roadmap item status semantics: \`in_progress\` and \`todo\` are actionable for \`plan next\`; \`deferred\` is parked backlog and must be reactivated before creating an executable plan. Roadmap items use \`todo / in_progress / done / deferred\`; plan phases use \`todo / in_progress / done / blocked\`. Legacy \`pending\`/\`planned\`/\`completed\` inputs are still accepted and normalized.

## Plans

- \`zenith plan create --json --input -\`
- \`zenith plan list --json\`
- \`zenith plan show <plan-id> --json\`
- \`zenith plan update <plan-id> --json --input -\`
- \`zenith plan update-phase <plan-id> --json --input -\`
- \`zenith plan next --json\`
- \`zenith plan next --json --stale-after-days <n>\` — include optional \`staleness\` metadata on the next step
- \`zenith plan complete <plan-id> --json\` — mark plan completed (all phases must be done); advances source roadmap item to \`done\`
- \`zenith plan advance --json --input -\` — mark a phase done + append evidence + recompute next step (one transaction); returns \`AdvanceResult\`
- \`zenith plan path <plan-id> --json\` — topological view of phases: \`orderedPhases\`, \`criticalPath\`, \`remaining\`, \`ready\` flags

\`plan update-phase\` JSON input accepts optional \`dependsOn\` (array of phase ids) to declare phase prerequisites. When all remaining \`todo\` phases are gated by unmet dependencies, \`plan next\` returns a recommendation prefixed \`Blocked by dependency:\` with a \`blockedBy\` array.

\`plan next\` will not auto-create work from deferred roadmap items. If only deferred roadmap work remains, review or reactivate a roadmap item first.

### plan next — NextStep.kind discriminant

\`plan next --json\` now returns an optional \`kind\` field for clean switch-dispatch in agent loops:

| kind | meaning |
|---|---|
| \`implement_phase\` | Implement the identified phase (in-progress or ready todo) |
| \`create_plan\` | Create a plan from the roadmap item |
| \`review_deferred\` | Reactivate a deferred roadmap item |
| \`blocking_finding\` | Fix or triage the critical/high finding |
| \`review_finding\` | Review an open finding (no active plan) |
| \`ambiguous_focus\` | Set \`zenith focus set <roadmap-id>\` to resolve multiple active plans |
| \`blocked_dependency\` | Unblock a dependency (blocked phase or all todos gated) |
| \`review_completed\` | All phases done; complete or archive the active plan |
| \`create_plan_empty\` | No plan, roadmap, finding, or session — create a plan |

\`kind\` is omitted when the fallback is a freeform session next-step.

When \`--stale-after-days <n>\` is provided, \`NextStep\` may include \`staleness\`: \`{ stale, ageDays, staleAfterDays, lastUpdatedAt }\`. The default \`plan next --json\` response omits it for compatibility.

### plan advance — AdvanceResult

\`plan advance\` payload: \`{ planId, completedPhaseId?, status?, evidence[] }\`

Response \`data\`:
\`\`\`json
{
  "completed": { "phaseId": "phase_x", "status": "done" },
  "planCompleted": false,
  "roadmapItemAdvanced": null,
  "next": { "recommendation": "...", "reason": "...", "kind": "implement_phase" }
}
\`\`\`

If all phases are done after the advance, \`planCompleted\` is \`true\` and (if linked) \`roadmapItemAdvanced\` contains \`{ roadmapId, itemId }\`.

## Context

- \`zenith context get --json\`
- \`zenith context compact --json\`
- \`zenith resume --json\`
- \`zenith phase show <phase-id> --json\`
- \`zenith timeline --json\` — read-only activity log; accepts \`--limit <n>\` and \`--since <eventId|iso>\`

Use \`--since <eventId|iso>\` to return only events after a checkpoint cursor (ISO timestamp or event id). Useful for resumed sessions to diff progress without re-reading the entire timeline.

## Self-Tracking Telemetry

- \`zenith standup --json [--days <n>]\` — daily digest of next step, events, completions, roadmap progress, and findings; default 1 day
- \`zenith diff --json [--since <eventId|iso>] [--limit <n>]\` — events since a cursor, or since the latest ended session by default
- \`zenith drift --json [--stale-after-days <n>]\` — roadmap-vs-active-plan alignment report; default stale threshold 7 days
- \`zenith adherence --json [--days <n>]\` — event-derived velocity and completion metrics; default 14 days

## Decisions

- \`zenith decision record --json --input -\`
- \`zenith decision list --json\`
- \`zenith decision show <decision-id> --json\`

## Findings

- \`zenith finding record --json --input -\`
- \`zenith finding list --status open --json\`
- \`zenith finding list --status closed --json\`
- \`zenith finding list --status all --json\`
- \`zenith finding show <finding-id> --json\`
- \`zenith finding update <finding-id> --json --input -\`
- \`zenith finding close <finding-id> --json\`

\`finding record\` and \`finding update\` JSON input accept optional \`relatedPlanId\` and \`relatedPhaseId\` to link a finding to an active plan or phase.

## Spikes

- \`zenith spike create --json --input -\`
- \`zenith spike record --json --input -\`
- \`zenith spike list --json\`
- \`zenith spike show <spike-id> --json\`
- \`zenith spike conclude <spike-id> --json --input -\`

## Sessions

- \`zenith session start --json --input -\`
- \`zenith session list --json\`
- \`zenith session show <session-id> --json\`
- \`zenith session capture <session-id> --json --input -\`
- \`zenith session end <session-id> --json --input -\`
- \`zenith session summarize --json --input -\`

## JSON Envelope

\`\`\`json
{
  "ok": true,
  "data": {},
  "warnings": [],
  "errors": [],
  "meta": {
    "schemaVersion": 1
  }
}
\`\`\`
`;
}

function workflowsTemplate(): string {
  return `
# Zenith Workflows

Use \`bun run zenith ...\` for the commands below if the \`zenith\` binary is not on PATH in this source checkout.

## Continue With Minimal Prompt

Run:

\`\`\`bash
zenith context compact --json
zenith plan next --json
\`\`\`

If \`plan next\` returns a \`phaseId\`, inspect it:

\`\`\`bash
zenith phase show phase_id --json
\`\`\`

Use that phase as the implementation target. If the user's prompt names a different target than \`plan next\`, stop and ask for confirmation.

## Before Planning

Run:

\`\`\`bash
zenith context compact --json
zenith plan next --json
zenith plan list --json
\`\`\`

If the project is not registered, ask whether to run \`zenith init --json\`.

## Self-Tracking Telemetry

Use these read-only commands when choosing or auditing the next work:

\`\`\`bash
zenith standup --json                 # daily digest; accepts --days <n>
zenith diff --json                    # changes since latest ended session
zenith diff --json --since <cursor>   # event id or ISO timestamp
zenith drift --json                   # roadmap-vs-active-plan alignment
zenith adherence --json               # velocity/adherence; accepts --days <n>
zenith plan next --json --stale-after-days 7
\`\`\`

Telemetry is derived from existing events and memory records. It must stay read-only; record progress with \`plan advance\`, sessions, findings, or decisions instead.

## Create A Plan

Use plans only for executable phased work. For direction, use \`zenith roadmap create\`. For investigation, use \`zenith spike create\` or \`zenith spike record\`.

Use stdin JSON:

\`\`\`bash
zenith plan create --json --input -
\`\`\`

Payload:

\`\`\`json
{
  "title": "Feature v1",
  "description": "Short purpose",
  "phases": [
    {
      "title": "Foundation",
      "status": "todo",
      "acceptanceCriteria": ["Command compiles", "Tests pass"]
    }
  ]
}
\`\`\`

## Convert Roadmap Direction To A Plan

Use this when a roadmap item is the next product target and there is no active plan.

\`\`\`bash
zenith roadmap create-plan roadmap_id --json --input -
\`\`\`

Payload:

\`\`\`json
{
  "itemId": "rmi_id",
  "title": "Executable plan title",
  "priority": "high",
  "phases": [
    {
      "title": "Implementation phase",
      "acceptanceCriteria": ["CLI flow works", "Tests pass"]
    }
  ]
}
\`\`\`

Created plans preserve \`sourceRoadmapId\`, \`sourceRoadmapItemId\`, and source evidence. Use \`itemTitle\` instead of \`itemId\` only when the title is unique.

Do not create a plan from a \`deferred\` roadmap item. \`plan next\` treats \`in_progress\` and \`todo\` roadmap items as actionable; if only deferred items remain, reactivate one with \`roadmap update-item\` before creating a plan.

## Insert Intermediate Roadmap Work

Use this when new prerequisite work belongs between existing MVPs. Do not rename later MVPs to make room; insert the new item after the completed/current item and explain why.

\`\`\`bash
zenith roadmap add-item roadmap_id --json --input -
\`\`\`

Payload:

\`\`\`json
{
  "title": "MVP 4.75 - Operational Memory Polish",
  "description": "Make memory operations inspectable and auditable before advanced skills.",
  "afterItemTitle": "MVP 4.5 - Product And Architecture Hardening",
  "justification": "Memory operations should be reliable and auditable before building review/delegation skills on top."
}
\`\`\`

Targeted insertions with \`position\`, \`afterItemId\`, or \`afterItemTitle\` require \`justification\`.

## Defer Roadmap Work

Use this when future roadmap work should stay visible but should not become the next executable plan automatically.

\`\`\`bash
zenith roadmap update-item roadmap_id --json --input -
\`\`\`

Payload:

\`\`\`json
{
  "itemTitle": "MVP 5 - PR Review Skill",
  "status": "deferred",
  "justification": "Core TUI and context behavior should be stronger before review skills."
}
\`\`\`

Deferred items are parked, not abandoned. To resume one, update it back to \`todo\` or \`in_progress\` with a new justification.

## Update A Phase

\`\`\`bash
zenith plan update-phase plan_id --json --input -
\`\`\`

Payload:

\`\`\`json
{
  "phaseTitle": "Foundation",
  "status": "done",
  "evidence": [
    {
      "kind": "note",
      "value": "Implemented storage migration tests."
    }
  ]
}
\`\`\`

## Sequence Phases With Dependencies

To declare that a phase must not start until another phase is done, set \`dependsOn\` via \`plan update-phase\`:

\`\`\`bash
zenith plan update-phase plan_id --json --input -
\`\`\`

Payload:

\`\`\`json
{
  "phaseId": "phase_x",
  "dependsOn": ["phase_y"]
}
\`\`\`

\`plan next\` skips phases whose \`dependsOn\` prerequisites are not yet \`done\`. When all remaining \`todo\` phases are gated, \`plan next\` returns a recommendation prefixed \`Blocked by dependency:\` and includes a \`blockedBy\` array listing the blocking phase ids.

## Update Plan Metadata

\`\`\`bash
zenith plan update plan_id --json --input -
\`\`\`

Payload:

\`\`\`json
{
  "title": "Plan title",
  "description": "Short purpose",
  "status": "active",
  "priority": "high"
}
\`\`\`

Use this for renaming plans, changing descriptions, pausing/activating plans, or changing priority. Do not update plan metadata with SQL.

## Close Completed Work

After implementation, run:

\`\`\`bash
bun x tsc --noEmit
bun test
bun run build
zenith plan update-phase plan_id --json --input -
\`\`\`

Evidence payload:

\`\`\`json
{
  "phaseId": "phase_id",
  "status": "done",
  "evidence": [
    { "kind": "command", "value": "bun x tsc --noEmit passed" },
    { "kind": "command", "value": "bun test passed" },
    { "kind": "command", "value": "bun run build passed" }
  ]
}
\`\`\`

## Record Findings

\`\`\`bash
zenith finding record --json --input -
\`\`\`

Payload:

\`\`\`json
{
  "type": "bug",
  "severity": "high",
  "title": "Missing retry around sync",
  "description": "A transient failure can drop pending progress.",
  "relatedFiles": ["src/sync.ts"],
  "relatedPlanId": "plan_id",
  "relatedPhaseId": "phase_id"
}
\`\`\`

Both \`relatedPlanId\` and \`relatedPhaseId\` are optional; include them to link the finding to the active plan or phase. \`finding update\` accepts the same optional fields.

Close a finding after the issue is handled:

\`\`\`bash
zenith finding show finding_id --json
zenith finding update finding_id --json --input -
zenith finding close finding_id --json
\`\`\`

## End A Session

\`\`\`bash
zenith session list --json
zenith session show session_id --json
zenith session end session_id --json --input -
\`\`\`

Payload:

\`\`\`json
{
  "summary": "Implemented the storage layer and tests.",
  "nextSteps": ["Wire CLI commands to the app service"]
}
\`\`\`

Use \`zenith session summarize --json --input -\` as a compatibility shortcut when there is no open session id.

## Long-Running Loop (multi-phase roadmap grind)

Use this workflow when driving a whole roadmap across one session (or resumed sessions).

### Setup — scope the work

\`\`\`bash
zenith plan path plan_id --json   # topological order, criticalPath, ready flags
zenith plan next --json           # first action
\`\`\`

### Iteration — one phase at a time

Read \`next.kind\` and dispatch:

| kind | action |
|---|---|
| \`implement_phase\` | \`zenith phase show <phaseId> --json\` → implement → verify (\`bun x tsc --noEmit && bun test && bun run build\`) → \`zenith plan advance --json --input -\` |
| \`blocking_finding\` | STOP — hand back to user |
| \`ambiguous_focus\` | STOP — hand back to user |
| \`blocked_dependency\` | STOP — hand back to user |
| \`review_finding\` | STOP — hand back to user |
| \`review_completed\` | Run \`zenith plan complete <plan-id> --json\` then continue to next roadmap item |
| \`create_plan\` | Run \`zenith roadmap create-plan <roadmap-id> --json --input -\` then loop |
| \`create_plan_empty\` | STOP — hand back to user |
| \`review_deferred\` | STOP — hand back to user |

Advance payload (mark phase done with evidence):

\`\`\`json
{
  "planId": "plan_id",
  "completedPhaseId": "phase_id",
  "evidence": [
    { "kind": "command", "value": "bun x tsc --noEmit passed" },
    { "kind": "command", "value": "bun test passed" }
  ]
}
\`\`\`

If \`planCompleted\` is \`true\` in the \`AdvanceResult\`, the plan has auto-completed and \`roadmapItemAdvanced\` reports which roadmap item moved to \`done\`. \`next\` already points at the next roadmap item.

### Checkpoint / Resume

Before pausing, record the latest event id as a cursor:

\`\`\`bash
zenith timeline --json --limit 1   # take data[0].id as cursor
\`\`\`

When resuming, use the cursor to diff progress since the pause:

\`\`\`bash
zenith timeline --json --since <cursor>   # events since pause
zenith resume --json                       # structured context
zenith plan next --json                    # current next step
\`\`\`
`;
}
