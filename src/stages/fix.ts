#!/usr/bin/env bun
/**
 * Stage 2 — fix
 *
 * Reads `jira-issues.json`, generates code fixes via the Claude agent, commits
 * and pushes each fix to its own branch, then writes `branches.json` for the
 * openPrs stage.
 *
 * If a remote branch already exists the issue is forwarded to the PR stage
 * without re-running Claude (no duplicate API calls or commits).
 *
 * Usage (from your project root):
 *   bunx jira-autofix-fix
 *   bun run jira-autofix:fix   # if added to your project's package.json scripts
 */

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { generateFix } from "../agents/claude";
import { loadConfig } from "../config";
import { buildContext } from "../context";
import { fetchOrigin, git, issueToBranch, remoteBranchExists } from "../github/gitUtils";
import type { JiraIssue } from "../jiraClient";
import type { BranchRecord } from "../types";

const ROOT = process.cwd();
const cfg = loadConfig();

// ── Read input ────────────────────────────────────────────────────────────

const issuesPath = join(ROOT, "jira-issues.json");
const issues: JiraIssue[] = JSON.parse(readFileSync(issuesPath, "utf8")) as JiraIssue[];

console.log(`jira-autofix fix  |  ${issues.length} issue(s) to process`);
if (cfg.dryRun) console.log("🔍  Dry-run mode — no commits or pushes will be made");

// ── Codebase context (prompt-cached across all generateFix calls) ─────────

const context = buildContext(ROOT);

// ── Git baseline ──────────────────────────────────────────────────────────

fetchOrigin(ROOT);
const defaultBranch = git("rev-parse --abbrev-ref HEAD", ROOT);

// ── Process issues ────────────────────────────────────────────────────────

const records: BranchRecord[] = [];

for (const issue of issues) {
  const branch = issueToBranch(issue);
  const title = `fix(${issue.key}): ${issue.summary}`;
  const body = buildPrBody(issue, cfg.jiraBaseUrl);

  console.log(`\n→ [${issue.key}] ${issue.summary}`);

  if (remoteBranchExists(branch, ROOT)) {
    console.log(`  ⏭  Branch already on remote — forwarding to PR stage`);
    records.push({ issueKey: issue.key, branch, title, body, pushed: false });
    continue;
  }

  try {
    // Clean up any stale local branch from a previous failed run
    try {
      git(`branch -D ${branch}`, ROOT);
      console.log(`  🗑  Deleted stale local branch ${branch}`);
    } catch {
      // Branch doesn't exist locally — nothing to do
    }

    git(`checkout -b ${branch}`, ROOT);

    const changes = await generateFix(
      issue,
      context,
      ROOT,
      cfg.anthropicApiKey,
      cfg.agentModel,
      cfg.agentMaxTokens,
    );

    if (changes.length === 0) {
      console.log("  ⚠  No file changes generated — skipping");
      git(`checkout ${defaultBranch}`, ROOT);
      continue;
    }

    for (const { path: filePath, content } of changes) {
      const abs = join(ROOT, filePath);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content, "utf8");
      console.log(`  ✏  ${filePath}`);
    }

    if (cfg.dryRun) {
      console.log("  🔍  Dry run — skipping commit and push");
      git(`checkout ${defaultBranch}`, ROOT);
      continue;
    }

    git("add .", ROOT);
    git(
      `commit -m "fix(${issue.key}): ${issue.summary.replace(/"/g, "'")}\n\nCloses ${issue.key}\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"`,
      ROOT,
    );
    git(`push origin ${branch}`, ROOT);
    console.log(`  ✓  Pushed ${branch}`);

    records.push({ issueKey: issue.key, branch, title, body, pushed: true });

    git(`checkout ${defaultBranch}`, ROOT);
  } catch (err) {
    console.error(`  ✗  Failed to process ${issue.key}:`, err);
    try {
      git(`checkout ${defaultBranch}`, ROOT);
      git(`branch -D ${branch}`, ROOT);
    } catch {
      // best-effort cleanup
    }
  }
}

// ── Write output ──────────────────────────────────────────────────────────

const outPath = join(ROOT, "branches.json");
writeFileSync(outPath, JSON.stringify(records, null, 2), "utf8");
console.log(`\nWrote ${outPath}  (${records.length} branch record(s))`);

// ── Helpers ───────────────────────────────────────────────────────────────

function buildPrBody(issue: JiraIssue, jiraBaseUrl: string): string {
  return [
    `Fixes **[${issue.key}](${jiraBaseUrl}/browse/${issue.key})** — ${issue.issueType}`,
    "",
    issue.description ? `> ${issue.description.replace(/\n/g, "\n> ")}` : "",
    "",
    "---",
    "🤖 Generated with [@anpu/jira-autofix](https://www.npmjs.com/package/@anpu/jira-autofix)",
  ].join("\n");
}
