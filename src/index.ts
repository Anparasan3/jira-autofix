#!/usr/bin/env bun
/**
 * jira-autofix — CLI entry point
 *
 * Modes (select with --mode=<cli|rest>):
 *
 *   --mode=cli   (default) One-shot run: fetch issues → fix → open PRs, then exit.
 *   --mode=rest            Start an HTTP server that exposes the pipeline via REST.
 *                          Endpoints: POST /run, GET /health
 *                          Port: PORT env var (default 3000)
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
 *   PORT                     REST server port (default: 3000, --mode=rest only)
 *   GITHUB_MODE              GitHub transport: "rest" (default) or "cli"
 *
 * Usage:
 *   bunx jira-autofix                  # CLI mode (default)
 *   bunx jira-autofix --mode=rest      # REST server mode
 *   DRY_RUN=true bunx jira-autofix
 *   GITHUB_MODE=cli bunx jira-autofix
 */

import { loadConfig } from "./core/config";
import { runPipeline } from "./core/pipeline";
import { startServer } from "./core/server";

// ── Mode flag ──────────────────────────────────────────────────────────────

const mode = process.argv.find((a) => a.startsWith("--mode="))?.split("=")[1] ?? "cli";

if (mode === "rest") {
  // ── REST server mode ─────────────────────────────────────────────────────
  startServer();
} else {
  // ── CLI mode ─────────────────────────────────────────────────────────────
  const cfg = loadConfig();
  runPipeline(cfg).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
