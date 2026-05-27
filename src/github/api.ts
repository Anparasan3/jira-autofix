/**
 * GitHub REST API helpers.
 * Uses fetch directly — no gh CLI required, works anywhere a token is available.
 */

// ── Response interfaces ─────────────────────────────────────────────────────

interface GitHubPrResponse {
  html_url: string;
}

// ── Type predicates ─────────────────────────────────────────────────────────

function isGitHubPrResponse(val: unknown): val is GitHubPrResponse {
  return (
    typeof val === "object" &&
    val !== null &&
    "html_url" in val &&
    typeof (val as Record<string, unknown>)["html_url"] === "string"
  );
}

// ── Public interface ────────────────────────────────────────────────────────

export interface PullRequestOptions {
  token: string;
  /** e.g. https://github.com/owner/repo.git  or  git@github.com:owner/repo.git */
  repoRemote: string;
  title: string;
  body: string;
  base: string;
  head: string;
}

// ── Internal helpers ────────────────────────────────────────────────────────

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

// ── Public functions ────────────────────────────────────────────────────────

/**
 * Creates a GitHub pull request and returns its HTML URL.
 * Throws if the API call fails or returns an unexpected shape.
 */
export async function createPullRequest(opts: PullRequestOptions): Promise<string> {
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

/**
 * Returns the URL of the first open PR for the given head branch, or null if none exists.
 */
export async function getPullRequestUrl(
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
