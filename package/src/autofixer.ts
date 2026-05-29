/**
 * autofixer — fluent API for @anpu/jira-autofix
 *
 * Usage:
 *   import autofixer from "@anpu/jira-autofix";
 *
 *   // Run the pipeline once
 *   const fixer = autofixer.init();
 *   await fixer.start();
 *
 *   // With custom schedule and options
 *   await autofixer.init({ schedule: "0 6 * * 1", dryRun: true }).start();
 *
 *   // Generate .github/workflows/jira-autofix.yml
 *   autofixer.init({ schedule: "0 6 * * *" }).generateWorkflow();
 *
 *   // Start REST server
 *   autofixer.init({ port: 3000 }).serve();
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { GithubMode } from "./config";
import { loadConfig } from "./config";
import type { PipelineResult } from "./pipeline";
import { runPipeline } from "./pipeline";
import { startServer } from "./server";

// ── Stage control ─────────────────────────────────────────────────────────────

/**
 * Pipeline stages that can be individually disabled via the `disable` option.
 *
 * - "fetch"        — skip Jira API call; pipeline returns empty immediately
 * - "branchSwitch" — skip git branch creation/checkout
 * - "agentFix"     — skip Claude agent; no file changes generated
 * - "raisePR"      — skip GitHub PR creation and Jira linking
 */
export type DisableStage = "fetch" | "branchSwitch" | "agentFix" | "raisePR";

// ── Options ──────────────────────────────────────────────────────────────────

export interface AutofixerOptions {
  /** Cron expression for the generated GitHub Actions workflow (default: every 6 h). */
  schedule?: string;
  /** Branch PRs are opened against (overrides BASE_BRANCH env var). */
  baseBranch?: string;
  /** Max Jira issues per run (overrides MAX_ISSUES env var). */
  maxIssues?: number;
  /** Preview mode — no commits, pushes, or PRs (overrides DRY_RUN env var). */
  dryRun?: boolean;
  /** Claude model to use (overrides JIRA_AUTOFIX_MODEL env var). */
  model?: string;
  /** Claude max output tokens (overrides JIRA_AUTOFIX_MAX_TOKENS env var). */
  maxTokens?: number;
  /** GitHub transport: "rest" (default) or "cli" (overrides GITHUB_MODE env var). */
  githubMode?: GithubMode;
  /** HTTP port for serve() (overrides PORT env var). */
  port?: number;
  /**
   * Pipeline stages to skip.
   * @example disable: ["fetch", "raisePR"]
   */
  disable?: DisableStage[];
}

// ── Autofixer class ───────────────────────────────────────────────────────────

export class Autofixer {
  private _schedule: string;

  constructor(private readonly opts: AutofixerOptions = {}) {
    this._schedule = opts.schedule ?? "0 */6 * * *";
  }

  /**
   * Override the cron schedule used by generateWorkflow(). Chainable.
   *
   * @example autofixer.init().schedule("0 9 * * 1-5").generateWorkflow()
   */
  schedule(cron: string): this {
    this._schedule = cron;
    return this;
  }

  /**
   * Run the full pipeline now: fetch Jira issues → generate fixes → open PRs.
   * Required env vars (JIRA_BASE_URL, JIRA_EMAIL, etc.) must be set.
   * Options passed to init() override the corresponding env vars.
   */
  async start(): Promise<PipelineResult> {
    const base = loadConfig();
    return runPipeline({
      ...base,
      baseBranch: this.opts.baseBranch ?? base.baseBranch,
      maxIssues: this.opts.maxIssues ?? base.maxIssues,
      dryRun: this.opts.dryRun ?? base.dryRun,
      agentModel: this.opts.model ?? base.agentModel,
      agentMaxTokens: this.opts.maxTokens ?? base.agentMaxTokens,
      githubMode: this.opts.githubMode ?? base.githubMode,
      disableFetch: this.disabled("fetch") || base.disableFetch,
      disableBranchSwitch: this.disabled("branchSwitch") || base.disableBranchSwitch,
      disableAgentFix: this.disabled("agentFix") || base.disableAgentFix,
      disableRaisePR: this.disabled("raisePR") || base.disableRaisePR,
    });
  }

  /**
   * Start a long-running HTTP server.
   * POST /run   — triggers the pipeline and returns PipelineResult as JSON.
   * GET  /health — health check.
   */
  serve(): void {
    if (this.opts.port != null) process.env["PORT"] = String(this.opts.port);
    startServer();
  }

  /**
   * Write a GitHub Actions workflow file to <root>/.github/workflows/jira-autofix.yml.
   * The file runs the full pipeline on the configured cron schedule.
   *
   * @param root Project root directory (default: process.cwd()).
   *
   * @example
   * autofixer.init({ schedule: "0 9 * * 1-5" }).generateWorkflow();
   * // → .github/workflows/jira-autofix.yml  (weekdays at 09:00 UTC)
   */
  generateWorkflow(root: string = process.cwd()): void {
    const outDir = join(root, ".github", "workflows");
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, "jira-autofix.yml");
    writeFileSync(outPath, this.buildWorkflowYml(), "utf8");
    console.log(`✓  Workflow written: ${outPath}`);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private disabled(stage: DisableStage): boolean {
    return this.opts.disable?.includes(stage) ?? false;
  }

  private buildWorkflowYml(): string {
    return [
      `name: Jira Auto-Fix`,
      ``,
      `on:`,
      `  schedule:`,
      `    - cron: '${this._schedule}'`,
      `  workflow_dispatch:`,
      ``,
      `jobs:`,
      `  fetch:`,
      `    name: Fetch Jira issues`,
      `    runs-on: ubuntu-latest`,
      `    outputs:`,
      `      has_issues: \${{ steps.fetch.outputs.has_issues }}`,
      `    steps:`,
      `      - uses: actions/checkout@v4`,
      `        with:`,
      `          fetch-depth: 0`,
      `      - uses: oven-sh/setup-bun@v2`,
      `      - name: Fetch issues`,
      `        id: fetch`,
      `        run: |`,
      `          bunx jira-autofix-fetch && echo "has_issues=true" >> \$GITHUB_OUTPUT || echo "has_issues=false" >> \$GITHUB_OUTPUT`,
      `        env:`,
      `          JIRA_BASE_URL: \${{ secrets.JIRA_BASE_URL }}`,
      `          JIRA_EMAIL: \${{ secrets.JIRA_EMAIL }}`,
      `          JIRA_API_TOKEN: \${{ secrets.JIRA_API_TOKEN }}`,
      `          JIRA_PROJECT_KEY: \${{ secrets.JIRA_PROJECT_KEY }}`,
      `          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}`,
      `      - uses: actions/upload-artifact@v4`,
      `        if: steps.fetch.outputs.has_issues == 'true'`,
      `        with:`,
      `          name: jira-issues`,
      `          path: jira-issues.json`,
      ``,
      `  fix:`,
      `    name: Generate fixes`,
      `    needs: fetch`,
      `    if: needs.fetch.outputs.has_issues == 'true'`,
      `    runs-on: ubuntu-latest`,
      `    permissions:`,
      `      contents: write`,
      `    steps:`,
      `      - uses: actions/checkout@v4`,
      `        with:`,
      `          token: \${{ secrets.GH_PAT }}`,
      `          fetch-depth: 0`,
      `      - uses: oven-sh/setup-bun@v2`,
      `      - uses: actions/download-artifact@v4`,
      `        with:`,
      `          name: jira-issues`,
      `      - name: Configure Git`,
      `        run: |`,
      `          git config user.name "github-actions[bot]"`,
      `          git config user.email "github-actions[bot]@users.noreply.github.com"`,
      `      - name: Generate and push fixes`,
      `        run: bunx jira-autofix-fix`,
      `        env:`,
      `          JIRA_BASE_URL: \${{ secrets.JIRA_BASE_URL }}`,
      `          JIRA_EMAIL: \${{ secrets.JIRA_EMAIL }}`,
      `          JIRA_API_TOKEN: \${{ secrets.JIRA_API_TOKEN }}`,
      `          JIRA_PROJECT_KEY: \${{ secrets.JIRA_PROJECT_KEY }}`,
      `          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}`,
      `          GH_PAT: \${{ secrets.GH_PAT }}`,
      `      - uses: actions/upload-artifact@v4`,
      `        with:`,
      `          name: branches`,
      `          path: branches.json`,
      ``,
      `  open-prs:`,
      `    name: Open PRs`,
      `    needs: fix`,
      `    runs-on: ubuntu-latest`,
      `    permissions:`,
      `      pull-requests: write`,
      `    steps:`,
      `      - uses: actions/checkout@v4`,
      `      - uses: oven-sh/setup-bun@v2`,
      `      - uses: actions/download-artifact@v4`,
      `        with:`,
      `          name: branches`,
      `      - name: Open PRs + link Jira`,
      `        run: bunx jira-autofix-open-prs`,
      `        env:`,
      `          JIRA_BASE_URL: \${{ secrets.JIRA_BASE_URL }}`,
      `          JIRA_EMAIL: \${{ secrets.JIRA_EMAIL }}`,
      `          JIRA_API_TOKEN: \${{ secrets.JIRA_API_TOKEN }}`,
      `          JIRA_PROJECT_KEY: \${{ secrets.JIRA_PROJECT_KEY }}`,
      `          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}`,
      `          GH_PAT: \${{ secrets.GH_PAT }}`,
    ].join("\n");
  }
}

// ── Default export ────────────────────────────────────────────────────────────

const autofixer = {
  /** Create an Autofixer instance with optional configuration. */
  init(opts?: AutofixerOptions): Autofixer {
    return new Autofixer(opts);
  },
};

export default autofixer;
