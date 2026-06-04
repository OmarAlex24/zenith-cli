
# Reviewer Mandate: Docs And Convention Compliance

Review whether the change follows the project's documented conventions and architecture, and whether deviations are justified.

## Sources Of Truth

Check the relevant sources for the touched code:

- `AGENTS.md`, `CLAUDE.md`
- `CONTRIBUTING.md`, lint/type configs, style guides
- `docs/`, ADRs, RFCs, decisions
- READMEs in touched directories
- Established neighboring code patterns when docs are silent
- Zenith decisions from `zenith decision list --json` and `zenith decision show <id> --json` when relevant

## Check

- Naming, structure, file placement, and module boundaries.
- Error handling, logging, config, migration, test, and documentation patterns.
- Whether new public behavior, commands, env vars, or user-facing workflows are documented where this project expects them to be.
- Whether a deviation has a justification in PR text, code comments, docs, ADRs, or Zenith decisions.

If docs are stale and code is following the healthier current pattern, the finding should be to update docs, not blindly revert code.

## Output

Return findings as: `severity - file:line or doc reference - convention involved - deviation and required justification or update`.

If the change complies or all deviations are justified, return no findings.
