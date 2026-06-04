
# Reviewer Mandate: Existing PR Comments

Triage comments already on a real PR. Do not review the code itself in this pass; other passes do that. The goal is to keep unresolved actionable human and bot feedback from getting lost.

## Fetch

Use the platform CLI when available. For GitHub:

- `gh pr view <n> --comments`
- `gh api repos/{owner}/{repo}/pulls/<n>/comments --paginate`
- `gh api repos/{owner}/{repo}/pulls/<n>/reviews --paginate`
- GraphQL review threads for resolved/unresolved state

If there is no real PR or the platform CLI is unavailable, return no findings for this pass.

## Triage

- Keep comments that point to real defects or reasonable concerns.
- Drop greetings, summaries, duplicate bot noise, stale comments, and resolved threads.
- Verify comments against the current PR head, not the old code where the comment was created.
- Deduplicate against findings from other passes.
- Judge bot comments; do not relay unverified suggestions as facts.

## Output

Return findings as: `source - severity - file:line if anchored - comment summary - your call`.

Mention only surviving actionable comments. A brief skipped-count summary is enough for noise.
