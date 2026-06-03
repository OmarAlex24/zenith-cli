
# Zenith Workflows

Use `bun run zenith ...` for the commands below if the `zenith` binary is not on PATH in this source checkout.

## Continue With Minimal Prompt

Run:

```bash
zenith context compact --json
zenith plan next --json
```

If `plan next` returns a `phaseId`, inspect it:

```bash
zenith phase show phase_id --json
```

Use that phase as the implementation target. If the user's prompt names a different target than `plan next`, stop and ask for confirmation.

## Before Planning

Run:

```bash
zenith context compact --json
zenith plan next --json
zenith plan list --json
```

If the project is not registered, ask whether to run `zenith init --json`.

## Create A Plan

Use plans only for executable phased work. For direction, use `zenith roadmap create`. For investigation, use `zenith spike create` or `zenith spike record`.

Use stdin JSON:

```bash
zenith plan create --json --input -
```

Payload:

```json
{
  "title": "Feature v1",
  "description": "Short purpose",
  "phases": [
    {
      "title": "Foundation",
      "status": "pending",
      "acceptanceCriteria": ["Command compiles", "Tests pass"]
    }
  ]
}
```

## Convert Roadmap Direction To A Plan

Use this when a roadmap item is the next product target and there is no active plan.

```bash
zenith roadmap create-plan roadmap_id --json --input -
```

Payload:

```json
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
```

Created plans preserve `sourceRoadmapId`, `sourceRoadmapItemId`, and source evidence. Use `itemTitle` instead of `itemId` only when the title is unique.

## Insert Intermediate Roadmap Work

Use this when new prerequisite work belongs between existing MVPs. Do not rename later MVPs to make room; insert the new item after the completed/current item and explain why.

```bash
zenith roadmap add-item roadmap_id --json --input -
```

Payload:

```json
{
  "title": "MVP 4.75 - Operational Memory Polish",
  "description": "Make memory operations inspectable and auditable before advanced skills.",
  "afterItemTitle": "MVP 4.5 - Product And Architecture Hardening",
  "justification": "Memory operations should be reliable and auditable before building review/delegation skills on top."
}
```

Targeted insertions with `position`, `afterItemId`, or `afterItemTitle` require `justification`.

## Update A Phase

```bash
zenith plan update-phase plan_id --json --input -
```

Payload:

```json
{
  "phaseTitle": "Foundation",
  "status": "completed",
  "evidence": [
    {
      "kind": "note",
      "value": "Implemented storage migration tests."
    }
  ]
}
```

## Update Plan Metadata

```bash
zenith plan update plan_id --json --input -
```

Payload:

```json
{
  "title": "Plan title",
  "description": "Short purpose",
  "status": "active",
  "priority": "high"
}
```

Use this for renaming plans, changing descriptions, pausing/activating plans, or changing priority. Do not update plan metadata with SQL.

## Close Completed Work

After implementation, run:

```bash
bun x tsc --noEmit
bun test
bun run build
zenith plan update-phase plan_id --json --input -
```

Evidence payload:

```json
{
  "phaseId": "phase_id",
  "status": "completed",
  "evidence": [
    { "kind": "command", "value": "bun x tsc --noEmit passed" },
    { "kind": "command", "value": "bun test passed" },
    { "kind": "command", "value": "bun run build passed" }
  ]
}
```

## Record Findings

```bash
zenith finding record --json --input -
```

Payload:

```json
{
  "type": "bug",
  "severity": "high",
  "title": "Missing retry around sync",
  "description": "A transient failure can drop pending progress.",
  "relatedFiles": ["src/sync.ts"]
}
```

Close a finding after the issue is handled:

```bash
zenith finding show finding_id --json
zenith finding update finding_id --json --input -
zenith finding close finding_id --json
```

## End A Session

```bash
zenith session list --json
zenith session show session_id --json
zenith session end session_id --json --input -
```

Payload:

```json
{
  "summary": "Implemented the storage layer and tests.",
  "nextSteps": ["Wire CLI commands to the app service"]
}
```

Use `zenith session summarize --json --input -` as a compatibility shortcut when there is no open session id.
