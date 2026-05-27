#!/usr/bin/env bun
/**
 * Pre-Bash hook — enforces Bun-first tooling.
 *
 * Blocks commands that use npm / npx / yarn / node directly.
 * All package operations in this project must go through `bun`.
 *
 * Claude Code passes the tool call as JSON on stdin:
 *   { "tool_name": "Bash", "tool_input": { "command": "..." } }
 *
 * Respond with { "decision": "block", "reason": "..." } to deny,
 * or exit 0 silently to allow.
 */

const input = await Bun.stdin.json().catch(() => ({}));
const command = (input?.tool_input?.command ?? '').trim();

// ── Rules ────────────────────────────────────────────────────────────────────

const rules = [
  {
    // npm install / npm add / npm ci / npm run / npm i
    pattern: /(?:^|[;&|]\s*)npm\s+(install|add|i\b|ci|run|uninstall|remove|update)/,
    reason:
      'Use `bun install` / `bun add` / `bun remove` / `bun run` instead of npm. This is a Bun project.',
  },
  {
    // bare npx
    pattern: /(?:^|[;&|]\s*)npx\s+/,
    reason: 'Use `bunx` instead of `npx`. Example: `bunx tsc --noEmit`.',
  },
  {
    // yarn install / yarn add / yarn run
    pattern: /(?:^|[;&|]\s*)yarn\s+(install|add|run|remove|upgrade)/,
    reason: 'Use `bun install` / `bun add` / `bun run` instead of yarn.',
  },
  {
    // pnpm (not used in this project)
    pattern: /(?:^|[;&|]\s*)pnpm\s+/,
    reason: 'Use `bun` instead of pnpm. This project uses Bun as the package manager.',
  },
  {
    // `node script.js` — but allow `node --version` / `node -e` / $(node -p ...)
    pattern: /(?:^|[;&|]\s*)node\s+(?!--version|--v8-options|-e\s|-p\s)/,
    reason: 'Use `bun` instead of `node` to run scripts. Example: `bun src/index.ts`.',
  },
  {
    // tsc directly — should go through bun run typecheck
    pattern: /(?:^|[;&|]\s*)tsc\s+(?!--version)/,
    reason:
      'Run `bun run typecheck` or `bunx tsc --noEmit` instead of bare `tsc`.',
  },
];

// ── Check rules ───────────────────────────────────────────────────────────────

for (const { pattern, reason } of rules) {
  if (pattern.test(command)) {
    process.stdout.write(JSON.stringify({ decision: 'block', reason }));
    process.exit(0);
  }
}

// Allow the command
process.exit(0);
