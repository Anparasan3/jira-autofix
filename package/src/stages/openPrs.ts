#!/usr/bin/env bun
/**
 * Stage 3 — openPrs
 *
 * Reads `branches.json`, creates a GitHub PR for each record (skipping any
 * that already have an open PR), then links and comments on the Jira issue.
 *
 * Exit code 1 if any PR creation fails so CI reports the failure.
 *
 * Usage (from your project root):
 *   bunx jira-autofix-open-prs
 *   bun run jira-autofix:open-prs   # if added to your project's package.json scripts
 */

import { readFileSync } from "fs";
import { join } from "path";
import { loadConfig } from "../config";
import { createPullRequest, getPullRequestUrl } from "../github/api";
import { git } from "../github/git";
import { JiraClient } from "../jiraClient";
import type { BranchRecord } from "../types";

const ROOT = process.cwd();
const cfg = loadConfig();

// ── Read input ────────────────────────────────────────────────────────────

const branchesPath = join(ROOT, "branches.json");
const records: BranchRecord[] = JSON.parse(readFileSync(branchesPath, "utf8")) as BranchRecord[];

console.log(`jira-autofix openPrs  |  ${records.length} branch record(s)`);

if (records.length === 0) {
  console.log("Nothing to do.");
  process.exit(0);
}

// ── Setup ─────────────────────────────────────────────────────────────────

const jira = new JiraClient({
  baseUrl: cfg.jiraBaseUrl,
  email: cfg.jiraEmail,
  apiToken: cfg.jiraApiToken,
});

const repoRemote = git("remote get-url origin", ROOT);

// ── Open PRs ──────────────────────────────────────────────────────────────

let anyFailed = false;

for (const record of records) {
  console.log(`\n→ [${record.issueKey}] ${record.branch}`);

  try {
    // Skip if a PR is already open for this branch
    const existingPr = await getPullRequestUrl({
      mode: cfg.githubMode,
      token: cfg.ghToken,
      repoRemote,
      head: record.branch,
    });

    if (existingPr) {
      console.log(`  ⏭  PR already open: ${existingPr}`);
      continue;
    }

    const prUrl = await createPullRequest({
      mode: cfg.githubMode,
      token: cfg.ghToken,
      repoRemote,
      title: record.title,
      body: record.body,
      base: cfg.baseBranch,
      head: record.branch,
    });

    console.log(`  ✓  PR: ${prUrl}`);

    // Show PR in Jira "Links" panel
    await jira.linkPullRequest(record.issueKey, prUrl, `GitHub PR: ${record.title}`);
    console.log(`  ✓  Jira linked`);

    // Also post a comment for visibility in the activity feed
    await jira.addComment(record.issueKey, `PR raised automatically: ${prUrl}`);
    console.log(`  ✓  Jira commented`);
  } catch (err) {
    console.error(`  ✗  Failed to open PR for ${record.issueKey}:`, err);
    anyFailed = true;
  }
}

if (anyFailed) {
  console.error("\n❌  One or more PR creations failed.");
  process.exit(1);
}

console.log("\n✅  Done.");
