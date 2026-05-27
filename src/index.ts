#!/usr/bin/env bun
/**
 * @anpu/jira-autofix — CLI entry point
 *
 * Fetches open Jira issues → asks Claude to fix them → opens a GitHub PR per issue.
 * Works in ANY project — just set the env vars below and run from your project root.
 *
 * Required env vars (set in .env at your project root or in CI secrets):
 *   JIRA_BASE_URL      e.g. https://yourteam.atlassian.net
 *   JIRA_EMAIL         your Atlassian account email
 *   JIRA_API_TOKEN     https://id.atlassian.com/manage-profile/security/api-tokens
 *   JIRA_PROJECT_KEY   e.g. PROJ
 *   ANTHROPIC_API_KEY  https://console.anthropic.com
 *   GH_PAT             GitHub PAT with repo scope (local dev)
 *   GITHUB_TOKEN       auto-injected in GitHub Actions (no setup needed)
 *
 * Optional env vars:
 *   BASE_BRANCH              default branch for PRs (default: master)
 *   MAX_ISSUES               max issues per run (default: 3)
 *   DRY_RUN                  "true" to skip git push and PR creation
 *   JIRA_AUTOFIX_MODEL       Claude model to use (default: claude-sonnet-4-6)
 *   JIRA_AUTOFIX_MAX_TOKENS  Claude max_tokens (default: 8096)
 *
 * Usage:
 *   bunx @anpu/jira-autofix          # run directly — no install needed
 *   DRY_RUN=true bunx @anpu/jira-autofix
 */

import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { generateFix } from "./agents/claude";
import { loadConfig } from "./config";
import { buildContext } from "./context";
import { createPullRequest, getPullRequestUrl } from "./github/api";
import {
  fetchOrigin,
  getRemoteUrl,
  git,
  issueToBranch,
  remoteBranchExists,
} from "./github/gitUtils";
import { JiraClient } from "./jiraClient";
import type { JiraIssue } from "./jiraClient";

// ── Bootstrap ──────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const cfg = loadConfig();

// ── PR body builder ────────────────────────────────────────────────────────

function buildPrBody(issue: JiraIssue): string {
  return [
    `Fixes **[${issue.key}](${cfg.jiraBaseUrl}/browse/${issue.key})** — ${issue.issueType}`,
    "",
    issue.description ? `> ${issue.description.replace(/\n/g, "\n> ")}` : "",
    "",
    "---",
    "🤖 Generated with [@anpu/jira-autofix](https://www.npmjs.com/package/@anpu/jira-autofix)",
  ].join("\n");
}

// ── Process one issue ──────────────────────────────────────────────────────

async function processIssue(
  issue: JiraIssue,
  context: string,
  defaultBranch: string,
  jira: JiraClient,
  repoRemote: string | null,
): Promise<void> {
  const branch = issueToBranch(issue);
  const title = `fix(${issue.key}): ${issue.summary}`;
  const body = buildPrBody(issue);

  console.log(`\n→ [${issue.key}] ${issue.summary}`);

  if (remoteBranchExists(branch, ROOT)) {
    if (!repoRemote) {
      console.log("  ⏭  Skipping — branch exists on remote (no remote URL to check PR)");
      return;
    }

    // Branch already pushed — check whether a PR exists before skipping
    const existingPr = await getPullRequestUrl({ token: cfg.ghToken, repoRemote, head: branch });

    if (existingPr) {
      console.log(`  ⏭  PR already open: ${existingPr}`);
      return;
    }

    // Branch exists but no PR yet — open one without re-generating the fix
    console.log("  🔁  Branch exists but no open PR — raising PR now…");
    const prUrl = await createPullRequest({
      token: cfg.ghToken,
      repoRemote,
      title,
      body,
      base: cfg.baseBranch,
      head: branch,
    });
    console.log(`  ✓  PR: ${prUrl}`);
    await jira.linkPullRequest(issue.key, prUrl, `GitHub PR: ${title}`);
    await jira.addComment(issue.key, `PR raised automatically: ${prUrl}`);
    console.log(`  ✓  Jira linked + commented`);
    return;
  }

  // Clean up any stale local branch from a previous failed run
  try {
    git(`branch -D ${branch}`, ROOT);
    console.log(`  🗑  Deleted stale local branch ${branch}`);
  } catch {
    // Branch doesn't exist locally — nothing to do
  }

  git(`checkout -b ${branch}`, ROOT);

  try {
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
      return;
    }

    for (const { path: filePath, content } of changes) {
      const abs = join(ROOT, filePath);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content, "utf8");
      console.log(`  ✏  ${filePath}`);
    }

    if (cfg.dryRun) {
      console.log("  🔍  Dry run — skipping commit, push, and PR");
      return;
    }

    if (!repoRemote) {
      console.log("  ⚠  No git remote configured — skipping push and PR");
      return;
    }

    git("add .", ROOT);
    git(
      `commit -m "fix(${issue.key}): ${issue.summary.replace(/"/g, "'")}\n\nCloses ${issue.key}\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"`,
      ROOT,
    );
    git(`push origin ${branch}`, ROOT);

    const prUrl = await createPullRequest({
      token: cfg.ghToken,
      repoRemote,
      title,
      body,
      base: cfg.baseBranch,
      head: branch,
    });
    console.log(`  ✓  PR: ${prUrl}`);

    await jira.linkPullRequest(issue.key, prUrl, `GitHub PR: ${title}`);
    await jira.addComment(issue.key, `PR raised automatically: ${prUrl}`);
    console.log(`  ✓  Jira linked + commented`);
  } finally {
    try {
      git(`checkout ${defaultBranch}`, ROOT);
    } catch {}
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `🚀  jira-autofix  |  project: ${cfg.jiraProjectKey}  |  branch: ${cfg.baseBranch}  |  model: ${cfg.agentModel}`,
  );
  if (cfg.dryRun) console.log("🔍  Dry-run mode — no commits or PRs will be created");

  const jira = new JiraClient({
    baseUrl: cfg.jiraBaseUrl,
    email: cfg.jiraEmail,
    apiToken: cfg.jiraApiToken,
  });

  fetchOrigin(ROOT);
  const defaultBranch = git("rev-parse --abbrev-ref HEAD", ROOT);
  const repoRemote = getRemoteUrl(ROOT);

  const issues = await jira.fetchOpenIssues(cfg.jiraProjectKey, cfg.maxIssues);
  if (issues.length === 0) {
    console.log("✅  No open issues found.");
    return;
  }

  console.log(`\nFound ${issues.length} issue(s):`);
  for (const i of issues) console.log(`  ${i.key}  [${i.issueType}]  ${i.summary}`);

  const context = buildContext(ROOT);

  for (const issue of issues) {
    try {
      await processIssue(issue, context, defaultBranch, jira, repoRemote);
    } catch (err) {
      console.error(`  ✗  ${issue.key} failed:`, err);
      try {
        git(`checkout ${defaultBranch}`, ROOT);
        git(`branch -D ${issueToBranch(issue)}`, ROOT);
      } catch {}
    }
  }

  console.log("\n✅  Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
