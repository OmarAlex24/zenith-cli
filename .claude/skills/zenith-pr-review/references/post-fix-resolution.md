
# Post-fix: Resolve Addressed PR Review Threads

Use this only after fixes have been committed and pushed to the PR head branch. Review threads should be resolved only when the feedback is fully addressed.

## Preconditions

- `gh` is installed and authenticated.
- You have write access to the PR.
- Fixes are already pushed to the PR's real head branch.
- You have inspected each thread individually.

## GitHub Flow

1. Identify owner, repo, and PR number:
   `gh pr view <n> --json number,url`
2. Fetch unresolved review threads with GraphQL `reviewThreads`, including `id`, `isResolved`, `isOutdated`, `path`, `line`, and recent comments.
3. Match each unresolved thread to the fix. Resolve only if the same concern is fully handled and no follow-up remains.
4. Resolve one thread at a time with GraphQL `resolveReviewThread(input: { threadId })`.
5. Re-fetch threads and verify only intended threads were resolved.

## Safety Rules

- Never bulk-resolve without per-thread inspection.
- Leave partial, unclear, contested, or still-relevant threads open.
- If permissions or GraphQL fail, report that instead of silently continuing.
- If unsure, leave the thread open and explain the status.
