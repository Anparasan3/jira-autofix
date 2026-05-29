/**
 * @anpu/jira-autofix — public library API
 *
 * Import from this file when using jira-autofix programmatically
 * rather than as a CLI. All types and core functions are exported here.
 *
 * @example
 * import { JiraClient, buildContext, runPipeline } from '@anpu/jira-autofix'
 */

// ── Jira ───────────────────────────────────────────────────────────────────
export { JiraClient } from "./jiraClient";
export type { JiraClientConfig, JiraIssue } from "./jiraClient";

// ── Config ─────────────────────────────────────────────────────────────────
export { loadConfig } from "./config";
export type { Config, GithubMode } from "./config";

// ── Context ────────────────────────────────────────────────────────────────
export { buildContext } from "./context";

// ── Claude agent ───────────────────────────────────────────────────────────
export { generateFix } from "./agents/claude";
export type { FileChange } from "./agents/claude";

// ── Pipeline ───────────────────────────────────────────────────────────────
export { buildPrBody, fixBranch, runPipeline } from "./pipeline";
export type { FixBranchResult, IssueResult, PipelineResult } from "./pipeline";

// ── REST server ────────────────────────────────────────────────────────────
export { startServer } from "./server";

// ── GitHub ─────────────────────────────────────────────────────────────────
export { createPullRequest, getPullRequestUrl } from "./github/api";
export type { PullRequestOptions } from "./github/api";

export {
  fetchOrigin,
  getRemoteUrl,
  git,
  issueToBranch,
  remoteBranchExists,
} from "./github/gitUtils";

// ── Shared types ───────────────────────────────────────────────────────────
export type { BranchRecord } from "./types";
