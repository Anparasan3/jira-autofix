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
export { default } from "./core/autofixer";
export type { Autofixer, AutofixerOptions, DisableStage } from "./core/autofixer";

// ── Jira ───────────────────────────────────────────────────────────────────
export { JiraClient } from "./jira/client";
export type { JiraClientConfig, JiraIssue } from "./jira/client";

// ── Config ─────────────────────────────────────────────────────────────────
export { loadConfig } from "./core/config";
export type { Config, GitHubMode } from "./core/config";

// ── Context ────────────────────────────────────────────────────────────────
export { buildContext } from "./core/context";

// ── Claude agent ───────────────────────────────────────────────────────────
export { generateFix } from "./agents/claude";
export type { FileChange } from "./agents/claude";

// ── Pipeline ───────────────────────────────────────────────────────────────
export { buildPrBody, fixBranch, runPipeline } from "./core/pipeline";
export type { FixBranchResult, IssueResult, PipelineResult } from "./core/pipeline";

// ── REST server ────────────────────────────────────────────────────────────
export { startServer } from "./core/server";

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
export type { BranchRecord } from "./core/types";
