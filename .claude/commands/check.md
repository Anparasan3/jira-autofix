# /check

Run the full quality-check suite — typecheck and format.

## Steps

### 1. TypeScript typecheck
```bash
bun run typecheck
```
Must exit clean (no errors). Fix every error before proceeding.

### 2. Format check
```bash
bunx oxfmt --check src/
```
Auto-fix with:
```bash
bunx oxfmt --write src/
```

## All-in-one
```bash
bun run typecheck && bunx oxfmt --check src/
```

## Source layout (after v1.1)

```
src/
├── index.ts               ← CLI entry point (full orchestrator)
├── config.ts              ← env var loading
├── context.ts             ← codebase context builder
├── jiraClient.ts          ← Jira REST API v3
├── types.ts               ← shared types (BranchRecord, JiraIssue)
├── agents/
│   └── claude/index.ts   ← Claude agent (read_file, list_files, write_file)
├── github/
│   ├── api.ts             ← GitHub REST API (createPR, getPRUrl)
│   └── gitUtils.ts        ← git helpers
└── stages/
    ├── fetch.ts           ← Stage 1: fetch issues → jira-issues.json
    ├── fix.ts             ← Stage 2: fix + push → branches.json
    └── openPrs.ts         ← Stage 3: open PRs + link Jira
```

## Notes
- Typecheck runs `tsc --noEmit` (see `tsconfig.json`)
- Bun is the runtime — use `bun run` / `bunx`, never `npm` / `npx`
- The post-edit hook auto-formats `.ts` files with oxfmt after every write
