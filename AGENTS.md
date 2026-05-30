# jira-autofix — Agent Guide

This is a **Bun CLI package** (not a web app). It fetches open Jira issues,
fixes them with Claude, and opens GitHub PRs — usable in any project via
`bunx jira-autofix`.

---

## Stack

| Layer | Tool |
|---|---|
| Runtime | Bun ≥ 1.3 (runs `.ts` directly — no build step) |
| Language | TypeScript (strict) |
| AI | Anthropic SDK (`@anthropic-ai/sdk`) |
| Package manager | Bun — never use `npm` / `npx` / `yarn` / `node` directly |

---

## Source layout

```
src/
├── index.ts               ← CLI entry (full run: fetch → fix → PR)
├── config.ts              ← env var loading (fails fast if required vars missing)
├── context.ts             ← builds codebase context for Claude (reads target project)
├── jiraClient.ts          ← Jira REST API v3 (POST /search/jql, comment, remotelink)
├── types.ts               ← BranchRecord, re-exports JiraIssue
├── agents/
│   └── claude/index.ts   ← Claude agent loop (tools: read_file, list_files, write_file)
├── github/
│   ├── api.ts             ← GitHub REST API (createPullRequest, getPullRequestUrl)
│   └── gitUtils.ts        ← git helpers (git(), remoteBranchExists(), issueToBranch())
└── stages/
    ├── fetch.ts           ← Stage 1: fetch issues → jira-issues.json
    ├── fix.ts             ← Stage 2: generate fixes, commit, push → branches.json
    └── openPrs.ts         ← Stage 3: open PRs, link + comment on Jira
```

---

## TypeScript standards

These rules apply to every file in this package.

### Types
- **No `any`** — use `unknown` when the type is genuinely unknown
- **No `as` casts** — derive types properly; use type guards and predicates instead
  - The only legitimate `as` cast is inside a validated helper (e.g. `asRecord`) that checks the type first
- **`interface` for object shapes** — use `type` only for unions / intersections / mapped types
- **Type predicates** for narrowing external API responses:
  ```ts
  function isFoo(val: unknown): val is Foo {
    return typeof val === "object" && val !== null && "bar" in val;
  }
  ```
- **SDK overloads** — use the specific param type to resolve overloads instead of casting the return:
  ```ts
  // ✅ correct — picks the non-streaming overload, return is Message
  async function call(payload: Anthropic.MessageCreateParamsNonStreaming) { ... }
  // ❌ wrong — return type is Message | Stream, needs a cast
  async function call(payload: Parameters<typeof client.messages.create>[0]) { ... }
  ```

### Variables & control flow
- **`const` by default** — use `let` only when reassignment is required; never `var`
- **`for...of` loops** — never `Array.forEach`
- **Strict equality** — always `===` / `!==`, never `==` / `!=`
- **Early return / throw** — fail fast with a clear message; never swallow errors silently
- **No `@ts-ignore`** — fix the root cause; use `@ts-ignore` only for SDK beta fields that
  aren't in the official typings yet, and always add a comment explaining why

### Functions & modules
- **DRY** — extract shared logic into helpers; no copy-paste between files
- **Pure helpers** — keep utilities (type guards, formatters, parsers) free of side effects
- **Single responsibility** — one clear job per function; split if it grows complex

### Data & errors
- **Dates** — use `date-fns` or `dayjs`; never write native `Date` arithmetic by hand
- **Money / math** — use `Decimal.js`; never rely on floating-point for currency or precise values
- **Error handling** — prefer `log + return` over `throw`; use static message strings and pass the original error as `cause`

---

## Coding rules

- **No build step** — `tsc --noEmit` for type-checking only; Bun executes `.ts` directly
- **Bun-first** — prefer `Bun.file`, `Bun.stdin` where it simplifies code; Node built-ins (`fs`, `child_process`, `path`) are fine
- **No external CLI deps** — the package must work with only Bun installed (no `gh`, `jq`, `curl`)
- **Config via env** — all configuration comes from `loadConfig()` in `src/config.ts`; never read `process.env` directly elsewhere
- **Always typecheck** — run `bun run typecheck` after every change and fix all errors
- **Small, focused changes** — fix exactly what the issue describes; prefer a targeted edit over rewriting an entire file

---

## Adding a new Claude tool

1. Add the schema to the `tools` array in `src/agents/claude/index.ts`
2. Add the handler branch in the `toolUses.map(...)` block, using `getStringInput(block.input, "key")` to extract values
3. Tool name: `snake_case`. Description: starts with a verb.
4. Always include a `required` array in `input_schema` (even if empty)
5. Return a plain string — never throw from a tool handler

---

## Adding a new env var

1. Add it to the `Config` interface and `loadConfig()` in `src/config.ts`
2. Mark it required (via the `require()` helper) or optional with a sensible default
3. Add it to `.env.example` with a comment
4. Document it in `README.md` options table

---

## Running locally

```bash
bun run typecheck                          # type-check all files
DRY_RUN=true bun run start                 # full dry run (no git/PR/Jira writes)
bun run fetch                              # stage 1 → jira-issues.json
DRY_RUN=true bun run fix                   # stage 2 → branches.json (no push)
bun run open-prs                           # stage 3 → open PRs
```

---

## Agent behavior rules

1. **Follow allowed commands** — respect every restriction listed in the target project's `AGENTS.md`
2. **Ask before deploying** — always get explicit approval before any production deployment
3. **No secrets in commits** — never commit API keys, tokens, passwords, or credentials
4. **Small, focused changes** — fix exactly what the issue describes; prefer a targeted edit over a large rewrite
5. **Typecheck after every change** — run `bun run typecheck` and fix all errors before finishing

---

## Key behaviours to preserve

- **Branch dedup** — if `fix/<key>-<slug>` already exists on remote AND a PR is open, skip silently
- **No-PR recovery** — if branch exists but no open PR, open it without re-running the fix
- **Stale branch cleanup** — delete local branch before `checkout -b` to avoid conflicts
- **Prompt caching** — context block tagged `cache_control: ephemeral` so repeated calls reuse the cached prompt
- **Retry logic** — API calls retry up to 4 times with exponential backoff (2 s, 4 s, 8 s)
- **Nudge** — if Claude ends a turn without writing a file, it is prompted once to call `write_file`
