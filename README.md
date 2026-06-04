# Zenith CLI

Local-first project memory and agent coordination CLI for developers using AI coding agents.

This MVP stores private project memory locally, exposes stable JSON commands for agents, and provides a read-only OpenTUI dashboard for humans.

## Status

Zenith is source-first while the repository is prepared for open-source distribution. The supported development and OpenTUI path is Bun from this checkout. A packaged headless launcher can be built locally for curl/Homebrew-style distribution templates; npm publication remains intentionally out of scope.

## Requirements

- Bun 1.x
- Git, when project detection should include repository context

## Install And Run From Source

Install dependencies:

```bash
bun install
```

Run Zenith from the checkout:

```bash
bun run zenith
bun run zenith --help
bun run zenith project detect --json
```

Running `bun run zenith` with no arguments launches the read-only OpenTUI continuity cockpit. The first screen centers readiness, ROI, next action, active plan, findings, spikes, and benchmark run context; Pulse and Bench sections remain available from the sidebar. Use `↑`/`↓` to navigate within the current region, `enter` to move focus forward (sidebar → content, and between columns inside the Roadmap workspace), `backspace` (or `←`) to move focus backward, number keys `1–9` to jump to the main sections, `0` to open Search, `r` to refresh, and `q` or `esc` to quit. JSON commands remain available by passing command arguments.

For a five-minute onboarding path, run the continuity demo guide:

```bash
bun run zenith demo list --json
bun run zenith demo show continuity
```

The `continuity` guide explains when Zenith helps, local storage and privacy boundaries, the daily `continue` → work → `checkpoint`/`done` loop, prompt handoff, benchmark proof, and source/packaged install paths. `demo` is read-only; it prints deterministic guide content and does not create sessions, benchmark runs, or files.

Register the current project when needed:

```bash
bun run zenith init --json
```

If a `zenith` binary is already available on `PATH`, the same commands work without `bun run`:

```bash
zenith project detect --json
zenith context compact --json
```

## Build Output

Build the bundled JavaScript entrypoint:

```bash
bun run build
bun dist/index.js project detect --json
```

The bundled JS entrypoint is a verified way to run built output.

Build the local packaged headless executable:

```bash
bun run compile
./dist/zenith --help
./dist/zenith project detect --json
```

The `dist/zenith` launcher runs the bundled `dist/zenith-headless.js` with Bun. It is headless: it supports CLI commands and JSON smoke tests, but it does not launch the OpenTUI dashboard when run without arguments. Use `bun run zenith` from the source checkout for the dashboard.

`bun run compile:standalone` remains available as an experimental Bun standalone build, but it is not the release packaging path until the compiled executable passes local smoke tests reliably.

Create a local release archive:

```bash
ZENITH_VERSION=v0.1.0 bun run package:release
```

This writes `dist/zenith-<os>-<arch>.tar.gz` plus a `.sha256` file. The archive contains the `zenith` launcher and `zenith-headless.js`; Bun must be installed on the target machine. Release URLs are templated until a repository remote is configured.

## Curl And Homebrew Templates

Install from a release artifact base URL:

```bash
ZENITH_INSTALL_BASE_URL=https://example.com/zenith/releases \
ZENITH_VERSION=v0.1.0 \
ZENITH_INSTALL_DIR="$HOME/.local/bin" \
sh scripts/install.sh
```

The install script requires Bun, downloads `zenith-<os>-<arch>.tar.gz`, extracts `zenith` plus `zenith-headless.js`, and installs both into `ZENITH_INSTALL_DIR`.

Homebrew packaging starts from [`packaging/homebrew/zenith.rb`](packaging/homebrew/zenith.rb). Replace `OWNER/REPO` and SHA placeholders after publishing release archives.

## Storage

Zenith stores private project memory in a local SQLite database. New installs use `~/.zenith/zenith.db` by default.

Storage home precedence:

1. `ZENITH_HOME`
2. `~/.zenith`

SQLite enforces core integrity such as foreign keys, status guards, active-plan per-roadmap uniqueness (one active plan per roadmap, plus one standalone), worktree-to-roadmap focus bindings, and source links for roadmap-derived plans. See [`docs/storage-policy.md`](docs/storage-policy.md) for the normalization policy behind embedded JSON arrays.

## Memory Types

- `brief`: stable project intent and why the project exists.
- `roadmap`: long-running product or technical direction.
- `plan`: executable phased work being done now.
- `spike`: bounded investigation to reduce uncertainty.
- `decision`: technical or strategic choice.
- `finding`: bug, risk, debt, or gap.
- `session`: work continuity log.

Use `plan` only for executable work. Store non-executable project memory with `brief`, `roadmap`, or `spike`.

## Daily Flow

Use these compact commands for normal continuity work:

```bash
zenith continue
zenith prompt --format codex --max-tokens 800
zenith checkpoint "What changed" --next "What should happen next"
zenith done
zenith blocked "What is blocked" --description "Why"
```

When working from this source checkout and the `zenith` binary is not on `PATH`, prefix the same commands with `bun run`, for example `bun run zenith continue`.

`continue`, `prompt`, `roi`, `demo`, benchmark read commands, TUI, and telemetry are read-only unless a command explicitly says it writes. `checkpoint`, `done`, and `blocked` are intentional writes for progress, phase completion, and blockers.

Use read-only proof and handoff commands when you need to measure or transfer context:

```bash
zenith roi
zenith demo show continuity
zenith benchmark list
zenith benchmark task continue-resume --variant prompt
```

## Agent Workflow

Agents should start with compact markdown context:

```bash
zenith continue
zenith prompt --format codex --max-tokens 800
```

Use structured JSON only when code needs to inspect fields programmatically or submit a typed payload:

```bash
zenith context compact --json
zenith plan next --json
zenith phase show <phase-id> --json
```

For code reviews, use the installed `zenith-pr-review` skill. For multi-agent handoffs, use `zenith-multi-agent` or the role-specific `zenith-planner`, `zenith-implementer`, and `zenith-reviewer` skills.

## Command Reference

The full command catalog, JSON envelope, and machine-readable examples live in [docs/reference.md](docs/reference.md). JSON APIs and schemas remain stable for integrations, scripts, and tests.

## Development

Run the local verification suite:

```bash
bun run typecheck
bun test
bun run build
bun run compile
```

Run the same commands through the convenience CI script:

```bash
bun run ci
```

GitHub Actions runs dependency installation, typecheck, tests, and build on pushes to `main` and pull requests.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution workflow and [docs/release.md](docs/release.md) for release packaging.

## License

MIT. See [LICENSE](LICENSE).
