# /dry-run

Run `jira-autofix` in dry-run mode — fetches Jira issues, generates fixes, and
writes files locally, but does **not** commit, push, or open any PRs.

## Prerequisites

Populate `.env` in your project root (see `.env.example`).

## Run

```bash
DRY_RUN=true bun run start
```

With a custom model or more issues:
```bash
DRY_RUN=true MAX_ISSUES=5 JIRA_AUTOFIX_MODEL=claude-opus-4-7 bun run start
```

## What to check

1. ✅ Issues fetched and listed with key, type, summary
2. ✅ Claude reads files (`📖 read …`) and writes fixes (`✏️ write …`)
3. ✅ Changed files written locally — inspect with `git diff`
4. ✅ `🔍 Dry run — skipping commit, push, and PR` in the output
5. ✅ No git branches created (`git branch` unchanged)
6. ✅ No GitHub PRs opened
7. ✅ No Jira comments posted

## Inspect then revert

```bash
git diff           # see what Claude wrote
git status         # which files changed
git checkout .     # revert all local writes when done
```

## Stage-by-stage dry run

```bash
# Stage 1 only — just fetch issues to jira-issues.json
bun run fetch

# Stage 2 dry — generate + write files but don't commit
DRY_RUN=true bun run fix

# Stage 3 only after a real push — check PR creation
bun run open-prs
```

## Notes
- Claude still makes real Anthropic API calls; only git/PR/Jira steps are skipped
- The `DRY_RUN` flag is checked in both `src/index.ts` and `src/stages/fix.ts`
- Safe to run at any time with no remote side effects
