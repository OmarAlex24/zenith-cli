# Contributing To Zenith CLI

Zenith is a Bun + TypeScript project. It stores local guidance context in SQLite and exposes stable JSON command contracts for agents.

## Local Setup

```bash
bun install
bun run zenith project detect --json
```

Register a local checkout before dogfooding guidance commands:

```bash
bun run zenith init --json
```

## Development Checks

Run these before sending changes:

```bash
bun run typecheck
bun test
bun run build
bun run compile
./dist/zenith --help
./dist/zenith project detect --json
```

`bun run zenith`, `bun run zenith tui`, `./dist/zenith`, and `./dist/zenith tui` launch the OpenTUI. The packaged launcher requires Bun on the target machine.

## Guidance Workflow

Use Zenith context before planning or continuing work:

```bash
bun run zenith context compact --json
bun run zenith plan next --json
bun run zenith search --json --query "related work"
```

Record durable project state with Zenith commands, not direct SQLite edits. Do not store secrets, full diffs, or long transcripts.

## Pull Requests

Keep changes scoped and include tests for changed behavior. When updating CLI contracts, update README and generated agent-pack references with:

```bash
bun run zenith agents install codex --json
bun run zenith agents install claude --json
```
