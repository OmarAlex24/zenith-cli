
# Reviewer Mandate: Design Quality

Review software design quality: the structural properties that determine how easy the code is to change, test, and reason about later. Do not duplicate the correctness pass.

## Assess

- Coupling: concrete dependencies where a narrow interface is needed, circular dependencies, provider/vendor details leaking into policy code.
- Cohesion: modules or functions mixing unrelated responsibilities.
- Abstraction: leaky, premature, too generic, too specific, or missing boundaries that block testing or change.
- Separation of concerns: business logic, I/O, persistence, presentation, config, and orchestration belong in appropriate places.
- Design patterns: useful when they solve a present problem; harmful when they add indirection without value.

## Judgment

Tie each design concern to a concrete cost in this codebase. "Violates DIP" is not useful. "This instantiates the network client inside business logic, so tests need live network and provider swaps require editing policy code" is useful.

Design issues are usually `should-fix` or design notes. Use `blocker` only when structure makes the change unsafe to merge.

## Output

Return findings as: `severity - file:line - structural issue - concrete consequence - suggested direction`.

Separate defects from judgment calls. If the design is sound, return no findings.
