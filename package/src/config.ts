/**
 * Config — loaded from environment variables.
 *
 * Set these in a .env file at the root of the project where you run
 * jira-autofix, or export them in your shell / CI secrets.
 *
 * Token resolution for GitHub:
 *   GH_PAT       — Personal Access Token with `repo` scope.
 *                  Set locally in .env or as a repo secret in GitHub Actions.
 *   GITHUB_TOKEN — Bot token auto-injected by GitHub Actions every run.
 *                  No setup needed in CI.
 *
 * GitHub transport (GITHUB_MODE):
 *   "rest" (default) — calls the GitHub REST API directly using GH_PAT / GITHUB_TOKEN.
 *   "cli"            — shells out to the `gh` CLI (must be installed and authenticated).
 *                      GH_PAT / GITHUB_TOKEN are not required in this mode.
 */

export type GithubMode = "cli" | "rest";

export interface Config {
  // Jira
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  jiraProjectKey: string;

  // Anthropic
  anthropicApiKey: string;

  // Agent tuning (optional — sensible defaults)
  agentModel: string;
  agentMaxTokens: number;

  // GitHub
  ghToken: string;
  githubMode: GithubMode;

  // Behaviour
  baseBranch: string;
  maxIssues: number;
  dryRun: boolean;

  // Pipeline stage controls
  disableFetch: boolean; // skip Jira API call — return empty result immediately
  disableBranchSwitch: boolean; // skip branch creation/checkout
  disableAgentFix: boolean; // skip Claude agent — no file changes
  disableRaisePR: boolean; // skip PR creation and Jira linking
}

export function loadConfig(): Config {
  const missing: string[] = [];

  function require(key: string): string {
    const value = process.env[key] ?? "";
    if (!value) missing.push(key);
    return value;
  }

  const cfg: Config = {
    // Jira
    jiraBaseUrl: require("JIRA_BASE_URL").replace(/\/$/, ""),
    jiraEmail: require("JIRA_EMAIL"),
    jiraApiToken: require("JIRA_API_TOKEN"),
    jiraProjectKey: require("JIRA_PROJECT_KEY"),

    // Anthropic
    anthropicApiKey: require("ANTHROPIC_API_KEY"),

    // Agent — override these to switch models without touching source code
    agentModel: process.env["JIRA_AUTOFIX_MODEL"] ?? "claude-sonnet-4-6",
    agentMaxTokens: Number(process.env["JIRA_AUTOFIX_MAX_TOKENS"] ?? "8096"),

    // GitHub transport — "cli" or "rest" (default: "rest")
    githubMode: (process.env["GITHUB_MODE"] ?? "rest") as GithubMode,

    // GitHub token — GH_PAT takes priority (local dev), then GITHUB_TOKEN (CI).
    // Only required in REST mode; skipped in CLI mode (gh CLI manages its own auth).
    ghToken: (() => {
      const token = process.env["GH_PAT"] || process.env["GITHUB_TOKEN"] || "";
      const mode = (process.env["GITHUB_MODE"] ?? "rest") as GithubMode;
      if (!token && mode === "rest") missing.push("GH_PAT or GITHUB_TOKEN");
      return token;
    })(),

    // Behaviour
    baseBranch: process.env["BASE_BRANCH"] ?? "master",
    maxIssues: Number(process.env["MAX_ISSUES"] ?? "3"),
    dryRun: process.env["DRY_RUN"] === "true",

    // Pipeline stage controls (all default false — full pipeline runs)
    disableFetch: process.env["DISABLE_FETCH"] === "true",
    disableBranchSwitch: process.env["DISABLE_BRANCH_SWITCH"] === "true",
    disableAgentFix: process.env["DISABLE_AGENT_FIX"] === "true",
    disableRaisePR: process.env["DISABLE_RAISE_PR"] === "true",
  };

  if (missing.length > 0) {
    console.error("❌  Missing required env vars:", missing.join(", "));
    console.error("\nAdd them to a .env file in your project root:");
    for (const k of missing) console.error(`  ${k}=`);
    process.exit(1);
  }

  return cfg;
}
