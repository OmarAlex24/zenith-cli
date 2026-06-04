
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

Return findings as: `severity - file:line - inconsistency or contract change - expected convention or compatibility action`.

If the change is consistent and has no surprising surface changes, return no findings.
