/**
 * GitHub API helpers — supports two transports:
 *
 *   "rest" (default) — calls the GitHub REST API directly via fetch().
 *                      Requires GH_PAT or GITHUB_TOKEN.
 *
 *   "cli"            — shells out to the `gh` CLI (must be installed and
 *                      authenticated with `gh auth login`).
 *                      Does NOT require GH_PAT / GITHUB_TOKEN.
 *
 * Select the transport by setting opts.mode (sourced from GITHUB_MODE env var).
 */

import { execSync } from "child_process";
import type { GitHubMode } from "../config";

// ── Shared types ────────────────────────────────────────────────────────────

export interface PullRequestOptions {
  mode: GitHubMode;
  /** REST mode: required. CLI mode: ignored (gh uses its own auth). */
  token: string;
  /** REST mode: required for repo parsing. CLI mode: ignored. */
  repoRemote: string;
  title: string;
  body: string;
  base: string;
  head: string;
}

// ════════════════════════════════════════════════════════════════════════════
// REST transport
// ════════════════════════════════════════════════════════════════════════════

interface GitHubPrResponse {
  html_url: string;
}

function isGitHubPrResponse(val: unknown): val is GitHubPrResponse {
  return (
    typeof val === "object" &&
    val !== null &&
    "html_url" in val &&
    typeof (val as Record<string, unknown>)["html_url"] === "string"
  );
}

function parseGitHubRemote(remote: string): { owner: string; repo: string } | null {
  const match = remote.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  if (!match || !match[1] || !match[2]) return null;
  return { owner: match[1], repo: match[2] };
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function createPullRequestViaRest(opts: PullRequestOptions): Promise<string> {
  const parsed = parseGitHubRemote(opts.repoRemote);
  if (!parsed) {
    console.error(`  ✗  Cannot parse GitHub remote: ${opts.repoRemote}`);
    throw new Error("Cannot parse GitHub remote", { cause: opts.repoRemote });
  }
  const { owner, repo } = parsed;

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    headers: githubHeaders(opts.token),
    body: JSON.stringify({
      title: opts.title,
      body: opts.body,
      base: opts.base,
      head: opts.head,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`  ✗  GitHub PR creation failed  status=${res.status}  body=${body}`);
    throw new Error("GitHub PR creation failed", { cause: { status: res.status, body } });
  }

  const raw: unknown = await res.json();
  if (!isGitHubPrResponse(raw)) {
    console.error(`  ✗  Unexpected GitHub PR response shape: ${JSON.stringify(raw)}`);
    throw new Error("Unexpected GitHub PR response shape", { cause: raw });
  }
  return raw.html_url;
}

async function getPullRequestUrlViaRest(
  opts: Pick<PullRequestOptions, "token" | "repoRemote" | "head">,
): Promise<string | null> {
  const parsed = parseGitHubRemote(opts.repoRemote);
  if (!parsed) return null;
  const { owner, repo } = parsed;

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls?head=${owner}:${opts.head}&state=open`,
    { headers: githubHeaders(opts.token) },
  );

  if (!res.ok) return null;

  const raw: unknown = await res.json();
  if (!Array.isArray(raw)) return null;

  const first: unknown = raw[0];
  return isGitHubPrResponse(first) ? first.html_url : null;
}

// ════════════════════════════════════════════════════════════════════════════
// CLI transport  (gh CLI)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Shell out to the gh CLI.
 * Returns stdout trimmed, or throws with stderr on non-zero exit.
 */
function ghExec(args: string): string {
  return execSync(`gh ${args}`, { encoding: "utf8" }).trim();
}

async function createPullRequestViaCli(opts: PullRequestOptions): Promise<string> {
  // gh pr create prints the PR URL to stdout on success.
  // Use --no-maintainer-edit to avoid interactive prompts in CI.
  const url = ghExec(
    [
      "pr create",
      `--title ${JSON.stringify(opts.title)}`,
      `--body ${JSON.stringify(opts.body)}`,
      `--base ${opts.base}`,
      `--head ${opts.head}`,
    ].join(" "),
  );

  if (!url.startsWith("http")) {
    console.error(`  ✗  gh pr create returned unexpected output: ${url}`);
    throw new Error("gh pr create returned unexpected output", { cause: url });
  }
  return url;
}

async function getPullRequestUrlViaCli(head: string): Promise<string | null> {
  try {
    // gh pr list with JSON output; jq-like --jq extracts the first URL.
    const url = ghExec(`pr list --head ${head} --state open --json url --jq ".[0].url"`);
    return url && url !== "null" ? url : null;
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Public façade — dispatches to the selected transport
// ════════════════════════════════════════════════════════════════════════════

/**
 * Creates a GitHub pull request and returns its HTML URL.
 * Dispatches to the REST API or `gh` CLI based on opts.mode.
 */
export async function createPullRequest(opts: PullRequestOptions): Promise<string> {
  if (opts.mode === "cli") {
    console.log(`  🔧  GitHub transport: gh CLI`);
    return createPullRequestViaCli(opts);
  }
  return createPullRequestViaRest(opts);
}

/**
 * Returns the URL of the first open PR for the given head branch, or null if none exists.
 * Dispatches to the REST API or `gh` CLI based on opts.mode.
 */
export async function getPullRequestUrl(
  opts: Pick<PullRequestOptions, "mode" | "token" | "repoRemote" | "head">,
): Promise<string | null> {
  if (opts.mode === "cli") {
    return getPullRequestUrlViaCli(opts.head);
  }
  return getPullRequestUrlViaRest(opts);
}
