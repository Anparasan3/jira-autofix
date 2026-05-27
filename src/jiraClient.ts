/**
 * Jira REST API v3 client
 */

// ── Internal helpers ────────────────────────────────────────────────────────

/**
 * Safely narrows an unknown API value to a plain object map.
 * Returns an empty object for null / non-objects so callers never crash.
 * This is the ONLY legitimate `as` cast in this file — it validates first.
 */
function asRecord(val: unknown): Record<string, unknown> {
  if (typeof val === "object" && val !== null && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  return {};
}

// ── Atlassian Document Format → plain text ──────────────────────────────────

function adfToText(node: unknown): string {
  const n = asRecord(node);
  if (Object.keys(n).length === 0) return "";
  if (n["type"] === "text") return String(n["text"] ?? "");
  const content = n["content"];
  if (Array.isArray(content)) return content.map(adfToText).join(" ");
  return "";
}

// ── Public types ────────────────────────────────────────────────────────────

export interface JiraIssue {
  key: string;
  summary: string;
  description: string;
  issueType: string;
}

export interface JiraClientConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

// ── Client ──────────────────────────────────────────────────────────────────

export class JiraClient {
  private readonly auth: string;
  private readonly baseUrl: string;

  constructor(config: JiraClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.auth = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}/rest/api/3${path}`, {
      ...options,
      headers: {
        Authorization: `Basic ${this.auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(
        `Jira ${options.method ?? "GET"} ${path} → ${res.status}: ${await res.text()}`,
      );
    }
    return res.json() as Promise<T>;
  }

  /**
   * Fetch open issues from a Jira project using the REST v3 search endpoint.
   * Uses POST /search/jql (v3 preferred over GET /search).
   */
  async fetchOpenIssues(projectKey: string, maxResults = 3): Promise<JiraIssue[]> {
    const jql = `project = "${projectKey}" AND status in ("To Do","Open","Backlog") AND issuetype in (Bug,Task,Story,Improvement) ORDER BY created DESC`;

    const data = await this.request<{ issues: unknown[] }>("/search/jql", {
      method: "POST",
      body: JSON.stringify({ jql, maxResults, fields: ["summary", "description", "issuetype"] }),
    });

    return (data.issues ?? []).map((raw) => {
      const issue = asRecord(raw);
      const fields = asRecord(issue["fields"]);
      const issuetype = asRecord(fields["issuetype"]);
      return {
        key: String(issue["key"] ?? ""),
        summary: String(fields["summary"] ?? ""),
        description: adfToText(fields["description"]),
        issueType: String(issuetype["name"] ?? "Task"),
      };
    });
  }

  /**
   * Post a comment on the Jira issue (visible in the activity feed).
   */
  async addComment(issueKey: string, text: string): Promise<void> {
    await this.request(`/issue/${issueKey}/comment`, {
      method: "POST",
      body: JSON.stringify({
        body: {
          type: "doc",
          version: 1,
          content: [{ type: "paragraph", content: [{ type: "text", text }] }],
        },
      }),
    });
  }

  /**
   * Attach a GitHub PR as a remote link on the Jira issue (shows in the
   * "Links" panel alongside other remote references).
   * Safe to call multiple times — skips if the URL is already linked.
   */
  async linkPullRequest(issueKey: string, prUrl: string, prTitle: string): Promise<void> {
    const existing = await this.request<unknown[]>(`/issue/${issueKey}/remotelink`);
    const alreadyLinked = existing.some((l) => {
      const link = asRecord(l);
      const obj = asRecord(link["object"]);
      return obj["url"] === prUrl;
    });
    if (alreadyLinked) return;

    await this.request(`/issue/${issueKey}/remotelink`, {
      method: "POST",
      body: JSON.stringify({ object: { url: prUrl, title: prTitle } }),
    });
  }
}
