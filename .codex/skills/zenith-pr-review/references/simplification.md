
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

Return findings as: `severity - file:line - what is more complex than needed - simpler version`.

Simplification findings are usually `should-fix` or `nit`, not blockers. If the change is already lean, return no findings.
