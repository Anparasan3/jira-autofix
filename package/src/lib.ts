/**
 * @anpu/jira-autofix — public library API
 *
 * Default import — fluent API:
 *   import autofixer from "@anpu/jira-autofix";
 *   await autofixer.init({ schedule: "0 9 * * 1-5" }).start();
 *   autofixer.init().generateWorkflow();
 *
 * Named imports — lower-level utilities:
 *   import { runPipeline, buildPrBody, issueToBranch } from "@anpu/jira-autofix";
 */

// ── Fluent API (default export) ────────────────────────────────────────────
export { default } from "./autofixer";
export type { Autofixer, AutofixerOptions, DisableStage } from "./autofixer";

// ── Jira ───────────────────────────────────────────────────────────────────
export { JiraClient } from "./jiraClient";
export type { JiraClientConfig, JiraIssue } from "./jiraClient";

// ── Config ─────────────────────────────────────────────────────────────────
export { loadConfig } from "./config";
export type { Config, GitHubMode } from "./config";

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
} from "./github/git";

// ── Shared types ───────────────────────────────────────────────────────────
export type { BranchRecord } from "./types";
