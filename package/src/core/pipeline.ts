/**
 * Core pipeline logic — shared between CLI (--mode=cli) and REST server (--mode=rest).
 *
 * Exported helpers:
 *   fixBranch()   — generate a Claude fix, commit, and push to a new branch.
 *                   Used by both runPipeline() and stages/fix.ts.
 *   buildPrBody() — canonical PR body builder (used by stages/fix.ts too).
 *   runPipeline() — full pipeline: fetch issues → fixBranch → open PRs → link Jira.
 */

import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { generateFix } from "../agents/claude";
import type { Config } from "./config";
import { buildContext } from "./context";
import { createPullRequest, getPullRequestUrl } from "../github/api";
import {
  fetchOrigin,
  getRemoteUrl,
  git,
  issueToBranch,
  remoteBranchExists,
} from "../github/git";
import { JiraClient } from "../jira/client";
import type { JiraIssue } from "../jira/client";

// ── Public types ────────────────────────────────────────────────────────────

export interface FixBranchResult {
  /** True when no changes were generated or dry-run is active. */
  skipped: boolean;
  /** True when changes were committed and pushed to origin. */
  pushed: boolean;
}

export interface IssueResult {
  key: string;
  summary: string;
  status: "processed" | "skipped" | "failed";
  prUrl?: string;
  error?: string;
}

export interface PipelineResult {
  project: string;
  model: string;
  dryRun: boolean;
  issuesFound: number;
  results: IssueResult[];
}

// ── PR body ─────────────────────────────────────────────────────────────────

export function buildPrBody(issue: JiraIssue, jiraBaseUrl: string): string {
  return [
    `Fixes **[${issue.key}](${jiraBaseUrl}/browse/${issue.key})** — ${issue.issueType}`,
    "",
    issue.description ? `> ${issue.description.replace(/\n/g, "\n> ")}` : "",
    "",
    "---",
    "🤖 Generated with [@anpu/jira-autofix](https://www.npmjs.com/package/@anpu/jira-autofix)",
  ].join("\n");
}

// ── fixBranch — shared generate + commit + push helper ──────────────────────

/**
 * Creates a branch, generates a Claude fix, writes the files, commits and pushes.
 * Always checks out back to `defaultBranch` when done (even on error).
 *
 * Callers are responsible for checking whether the branch already exists on the
 * remote before calling this function.
 */
export async function fixBranch(
  issue: JiraIssue,
  context: string,
  root: string,
  defaultBranch: string,
  cfg: Config,
): Promise<FixBranchResult> {
  const branch = issueToBranch(issue);

  // Clean up any stale local branch from a previous failed run
  try {
    git(`branch -D ${branch}`, root);
    console.log(`  🗑  Deleted stale local branch ${branch}`);
  } catch {
    // Branch doesn't exist locally — nothing to do
  }

  if (cfg.disableBranchSwitch) {
    console.log("  ⏭  Branch switch disabled — skipping");
    return { skipped: true, pushed: false };
  }

  git(`checkout -b ${branch}`, root);

  try {
    if (cfg.disableAgentFix) {
      console.log("  ⏭  Agent fix disabled — skipping");
      return { skipped: true, pushed: false };
    }

    const changes = await generateFix(
      issue,
      context,
      root,
      cfg.anthropicApiKey,
      cfg.agentModel,
      cfg.agentMaxTokens,
    );

    if (changes.length === 0) {
      console.log("  ⚠  No file changes generated — skipping");
      return { skipped: true, pushed: false };
    }

    for (const { path: filePath, content } of changes) {
      const abs = join(root, filePath);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content, "utf8");
      console.log(`  ✏  ${filePath}`);
    }

    if (cfg.dryRun) {
      console.log("  🔍  Dry run — skipping commit and push");
      return { skipped: true, pushed: false };
    }

    git("add .", root);
    git(
      `commit -m "fix(${issue.key}): ${issue.summary.replace(/"/g, "'")}\n\nCloses ${issue.key}\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"`,
      root,
    );
    git(`push origin ${branch}`, root);
    console.log(`  ✓  Pushed ${branch}`);

    return { skipped: false, pushed: true };
  } finally {
    try {
      git(`checkout ${defaultBranch}`, root);
    } catch {}
  }
}

// ── processIssue — fix + open PR ─────────────────────────────────────────────

async function processIssue(
  issue: JiraIssue,
  context: string,
  root: string,
  defaultBranch: string,
  jira: JiraClient,
  repoRemote: string | null,
  cfg: Config,
): Promise<IssueResult> {
  const branch = issueToBranch(issue);
  const title = `fix(${issue.key}): ${issue.summary}`;
  const body = buildPrBody(issue, cfg.jiraBaseUrl);

  console.log(`\n→ [${issue.key}] ${issue.summary}`);

  // ── Branch already on remote ───────────────────────────────────────────────
  if (remoteBranchExists(branch, root)) {
    // REST mode needs the remote URL to locate the repo; CLI mode uses gh's context.
    if (!repoRemote && cfg.githubMode === "rest") {
      console.log("  ⏭  Skipping — no git remote URL (required for REST mode)");
      return { key: issue.key, summary: issue.summary, status: "skipped" };
    }

    const existingPr = await getPullRequestUrl({
      mode: cfg.githubMode,
      token: cfg.ghToken,
      repoRemote: repoRemote ?? "",
      head: branch,
    });

    if (existingPr) {
      console.log(`  ⏭  PR already open: ${existingPr}`);
      return { key: issue.key, summary: issue.summary, status: "skipped", prUrl: existingPr };
    }

    // Branch exists but no PR — open one immediately without re-running Claude.
    console.log("  🔁  Branch exists but no open PR — raising PR now…");
    const prUrl = await createPullRequest({
      mode: cfg.githubMode,
      token: cfg.ghToken,
      repoRemote: repoRemote ?? "",
      title,
      body,
      base: cfg.baseBranch,
      head: branch,
    });
    console.log(`  ✓  PR: ${prUrl}`);
    await jira.linkPullRequest(issue.key, prUrl, `GitHub PR: ${title}`);
    await jira.addComment(issue.key, `PR raised automatically: ${prUrl}`);
    console.log(`  ✓  Jira linked + commented`);
    return { key: issue.key, summary: issue.summary, status: "processed", prUrl };
  }

  // ── New branch: generate fix, commit, push ─────────────────────────────────
  if (!repoRemote) {
    console.log("  ⚠  No git remote configured — skipping push and PR");
    return { key: issue.key, summary: issue.summary, status: "skipped" };
  }

  const { skipped } = await fixBranch(issue, context, root, defaultBranch, cfg);
  if (skipped) {
    return { key: issue.key, summary: issue.summary, status: "skipped" };
  }

  // ── Open PR ────────────────────────────────────────────────────────────────
  if (cfg.disableRaisePR) {
    console.log("  ⏭  PR creation disabled — branch pushed, no PR raised");
    return { key: issue.key, summary: issue.summary, status: "skipped" };
  }

  const prUrl = await createPullRequest({
    mode: cfg.githubMode,
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

  return { key: issue.key, summary: issue.summary, status: "processed", prUrl };
}

// ── runPipeline ───────────────────────────────────────────────────────────────

export async function runPipeline(cfg: Config): Promise<PipelineResult> {
  const ROOT = process.cwd();

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

  if (cfg.disableFetch) {
    console.log("⏭  Jira fetch disabled — no issues to process.");
    return {
      project: cfg.jiraProjectKey,
      model: cfg.agentModel,
      dryRun: cfg.dryRun,
      issuesFound: 0,
      results: [],
    };
  }

  const issues = await jira.fetchOpenIssues(cfg.jiraProjectKey, cfg.maxIssues);

  if (issues.length === 0) {
    console.log("✅  No open issues found.");
    return {
      project: cfg.jiraProjectKey,
      model: cfg.agentModel,
      dryRun: cfg.dryRun,
      issuesFound: 0,
      results: [],
    };
  }

  console.log(`\nFound ${issues.length} issue(s):`);
  for (const i of issues) console.log(`  ${i.key}  [${i.issueType}]  ${i.summary}`);

  const context = buildContext(ROOT);
  const results: IssueResult[] = [];

  for (const issue of issues) {
    try {
      results.push(await processIssue(issue, context, ROOT, defaultBranch, jira, repoRemote, cfg));
    } catch (err) {
      console.error(`  ✗  ${issue.key} failed:`, err);
      results.push({
        key: issue.key,
        summary: issue.summary,
        status: "failed",
        error: String(err),
      });
      try {
        git(`checkout ${defaultBranch}`, ROOT);
        git(`branch -D ${issueToBranch(issue)}`, ROOT);
      } catch {}
    }
  }

  console.log("\n✅  Done.");
  return {
    project: cfg.jiraProjectKey,
    model: cfg.agentModel,
    dryRun: cfg.dryRun,
    issuesFound: issues.length,
    results,
  };
}
