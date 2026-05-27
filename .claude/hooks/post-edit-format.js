#!/usr/bin/env bun
/**
 * Post-Edit hook — auto-formats TypeScript files with oxfmt.
 *
 * Runs after every Write, Edit, or MultiEdit tool call.
 * Skips non-TS files and gracefully ignores formatter errors
 * so it never interrupts Claude's work.
 *
 * Claude Code passes the completed tool call as JSON on stdin:
 *   { "tool_name": "Write"|"Edit"|"MultiEdit", "tool_input": { "file_path": "..." } }
 */

import { spawnSync } from 'child_process';

const input = await Bun.stdin.json().catch(() => ({}));
const toolName = input?.tool_name ?? '';
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

if (!['Write', 'Edit', 'MultiEdit'].includes(toolName)) {
  process.exit(0);
}

const filePath = input?.tool_input?.file_path ?? '';

if (!/\.(ts|tsx)$/.test(filePath)) {
  process.exit(0);
}

// Run oxfmt --write on the edited file
spawnSync('bunx', ['oxfmt', '--write', filePath], {
  cwd: projectDir,
  stdio: 'pipe',
});

// Exit silently regardless of formatter result — never block the edit
process.exit(0);
