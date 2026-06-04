# Zenith Manual Benchmarks

This directory contains tracked benchmark scenarios for comparing continuity workflows manually before the benchmark CLI stores local run records.

Scenarios live in `benchmarks/scenarios/*.json`. Each scenario defines:

- setup steps
- the task prompt
- success criteria
- expected Zenith continuity signals
- evaluator metrics
- supported variants
- privacy rules

The TypeScript helpers in `src/benchmarks/scenarios.ts` load scenarios, list summaries, and render copyable task prompts. They do not run provider agents, capture model output, write benchmark results, or store transcripts.

CLI workflow:

```bash
bun run zenith benchmark list --json
bun run zenith benchmark task continue-resume --variant prompt --json
bun run zenith benchmark record --json --input -
bun run zenith benchmark runs --json
bun run zenith benchmark compare --scenario continue-resume --json
```

`benchmark record` writes strict run metadata under the configured Zenith home at `benchmarks/runs.json`. Repo-local ad hoc exports belong under gitignored `benchmarks/results/`.

Privacy boundary:

- Do not store full model transcripts.
- Do not store secrets, credentials, tokens, or full diffs.
- For manual notes, record only scenario id, variant, timestamps, and evaluator-entered scores.
