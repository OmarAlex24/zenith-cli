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
  const skillDir = join(rootPath, skillRoot, "skills", "zenith-memory");

  files.push(writeMarkedFile(rootFilePath, rootInstructions(agent)));

  mkdirSync(join(skillDir, "references"), { recursive: true });
  files.push(writeCompleteFile(join(skillDir, "SKILL.md"), skillTemplate(agent)));
  files.push(writeCompleteFile(join(skillDir, "references", "cli-reference.md"), cliReferenceTemplate()));
  files.push(writeCompleteFile(join(skillDir, "references", "workflows.md"), workflowsTemplate()));

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
  const skillPath = agent === "codex" ? ".codex/skills/zenith-memory/SKILL.md" : ".claude/skills/zenith-memory/SKILL.md";

  return `
# Zenith Memory

This repository uses Zenith CLI as private local project memory.

Use the zenith-memory skill at ${skillPath} when:
- recording the project brief or long-running roadmap
- creating implementation plans
- recording bounded research spikes
- continuing previous work
- updating project progress
- recording technical decisions
- recording and closing findings
- starting, capturing, ending, or summarizing a coding session

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

function skillTemplate(agent: AgentKind): string {
  return `---
name: zenith-memory
description: Use when working in a repository that uses Zenith CLI to read local project context, continue previous work, maintain briefs/roadmaps/spikes, update executable plan progress, record findings/decisions, and manage sessions.
---

# Zenith Memory

Use this skill when the user asks to plan, resume, record project intent, maintain roadmap direction, record research spikes, store technical decisions, record findings, or close a meaningful coding session.

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
- After verified implementation work, inspect the git status and propose committing the completed change set so future Zenith context does not remain dirty. Do not commit without user confirmation.

## Workflow

1. Read current project context:
   \`zenith context compact --json\`
2. Ask Zenith what should happen next:
   \`zenith plan next --json\`
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

\`plan next\` will not auto-create work from deferred roadmap items. If only deferred roadmap work remains, review or reactivate a roadmap item first.

## Context

- \`zenith context get --json\`
- \`zenith context compact --json\`
- \`zenith resume --json\`
- \`zenith phase show <phase-id> --json\`

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
  "relatedFiles": ["src/sync.ts"]
}
\`\`\`

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
`;
}
