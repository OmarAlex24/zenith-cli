# Zenith CLI

Local-first project memory and agent coordination CLI for developers using AI coding agents.

This MVP stores private project memory locally, exposes stable JSON commands for agents, and provides a read-only OpenTUI dashboard for humans.

The public product name is Zenith CLI. The `decode` binary remains available as a compatibility alias while the command surface migrates to `zenith`.

## Storage

Zenith stores private project memory in a local SQLite database. New installs use `~/.zenith/zenith.db` by default.

Storage home precedence:

1. `ZENITH_HOME`
2. `DECODE_HOME` legacy fallback
3. `~/.decode` when that legacy directory already exists
4. `~/.zenith`

When Zenith uses the legacy `~/.decode` home, it keeps the legacy database name `decode.db`. All other homes use `zenith.db`.

## Memory Types

- `brief`: stable project intent and why the project exists.
- `roadmap`: long-running product or technical direction.
- `plan`: executable phased work being done now.
- `spike`: bounded investigation to reduce uncertainty.
- `decision`: technical or strategic choice.
- `finding`: bug, risk, debt, or gap.
- `session`: work continuity log.

Use `plan` only for executable work. Store non-executable project memory with `brief`, `roadmap`, or `spike`.

## Agent Workflow

Use Zenith as the source of truth before planning or continuing work:

```bash
zenith context compact --json
zenith plan next --json
```

When working from this source checkout and the `zenith` binary is not on `PATH`, use `bun run zenith ...` for the same commands.

If `plan next` returns a `planId` and `phaseId`, inspect the phase before implementing:

```bash
zenith phase show <phase-id> --json
```

Plan metadata can be updated without touching SQLite directly:

```bash
zenith plan update <plan-id> --json --input -
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

Roadmaps and spikes have separate commands:

```bash
zenith brief set --json --input -
zenith roadmap create --json --input -
zenith roadmap import-plan <plan-id> --json --input -
zenith spike create --json --input -
zenith spike conclude <spike-id> --json --input -
```

Findings and sessions close the operational memory loop:

```bash
zenith finding record --json --input -
zenith finding list --json
zenith finding close <finding-id> --json
zenith session start --json --input -
zenith session capture <session-id> --json --input -
zenith session end <session-id> --json --input -
```

Phase progress is recorded with evidence:

```bash
zenith plan update-phase <plan-id> --json --input -
```

Use `decode` only as a legacy alias when `zenith` is not available.
