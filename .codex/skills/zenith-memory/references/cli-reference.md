
# Zenith CLI Reference

All agent-facing commands should use `--json`.
If the `zenith` binary is not on PATH while working inside this source checkout, use `bun run zenith ...`.

## Project

- `zenith init --json`
- `zenith project detect --json`
- `zenith project status --json`

## Brief

- `zenith brief set --json --input -`
- `zenith brief show --json`
- `zenith brief list --json`

## Roadmaps

- `zenith roadmap create --json --input -`
- `zenith roadmap list --json`
- `zenith roadmap show <roadmap-id> --json`
- `zenith roadmap update <roadmap-id> --json --input -`
- `zenith roadmap add-item <roadmap-id> --json --input -`
- `zenith roadmap update-item <roadmap-id> --json --input -`
- `zenith roadmap import-plan <plan-id> --json --input -`
- `zenith roadmap create-plan <roadmap-id> --json --input -`

## Plans

- `zenith plan create --json --input -`
- `zenith plan list --json`
- `zenith plan show <plan-id> --json`
- `zenith plan update <plan-id> --json --input -`
- `zenith plan update-phase <plan-id> --json --input -`
- `zenith plan next --json`

## Context

- `zenith context get --json`
- `zenith context compact --json`
- `zenith resume --json`
- `zenith phase show <phase-id> --json`

## Decisions

- `zenith decision record --json --input -`
- `zenith decision list --json`
- `zenith decision show <decision-id> --json`

## Findings

- `zenith finding record --json --input -`
- `zenith finding list --json`
- `zenith finding close <finding-id> --json`

## Spikes

- `zenith spike create --json --input -`
- `zenith spike record --json --input -`
- `zenith spike list --json`
- `zenith spike show <spike-id> --json`
- `zenith spike conclude <spike-id> --json --input -`

## Sessions

- `zenith session start --json --input -`
- `zenith session capture <session-id> --json --input -`
- `zenith session end <session-id> --json --input -`
- `zenith session summarize --json --input -`

## JSON Envelope

```json
{
  "ok": true,
  "data": {},
  "warnings": [],
  "errors": [],
  "meta": {
    "schemaVersion": 1
  }
}
```
