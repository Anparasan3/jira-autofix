# /release

Bump the version, publish to npm, and push the version tag to GitHub.

## Prerequisites
- On `master` branch with a clean working tree
- npm login active: `bunx npm whoami` (should show your npm username)
- All checks passing: `/check`

## Steps

### 1. Bump the version in `package.json`

| Change type | Version part |
|---|---|
| Bug fix / small improvement | patch → `1.1.x` |
| New feature (backwards compatible) | minor → `1.x.0` |
| Breaking change | major → `x.0.0` |

Edit `package.json` `"version"` field directly, then:
```bash
git add package.json
git commit -m "chore: bump version to X.Y.Z"
```

### 2. Typecheck
```bash
bun run typecheck
```

### 3. Publish
```bash
bunx npm publish --access public
```
The `files` field in `package.json` controls what is shipped (`src/`).
All four `bin` entries are included automatically.

### 4. Tag and push
```bash
git tag vX.Y.Z
git push origin master --tags
```

## Verify

```bash
bunx npm view @anpu/jira-autofix
```

Check: https://www.npmjs.com/package/@anpu/jira-autofix

## What ships in the package

| Path | Purpose |
|---|---|
| `src/index.ts` | `jira-autofix` bin — full orchestrator |
| `src/stages/fetch.ts` | `jira-autofix-fetch` bin |
| `src/stages/fix.ts` | `jira-autofix-fix` bin |
| `src/stages/openPrs.ts` | `jira-autofix-open-prs` bin |
| `src/agents/claude/` | Claude agent |
| `src/github/` | GitHub REST API + git helpers |
| `src/config.ts` | Env var loading |
| `src/context.ts` | Project context builder |
| `src/jiraClient.ts` | Jira REST API v3 client |
| `src/types.ts` | Shared types |

## Notes
- No build step — Bun executes `.ts` directly at runtime
- Consumers only need Bun ≥ 1.3 and `typescript >=5` (peer dep)
- After publishing, test with: `bunx @anpu/jira-autofix --help`
