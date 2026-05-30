/**
 * Git helper utilities
 */

import { execSync } from "child_process";
import type { JiraIssue } from "../jira/client";

export function git(cmd: string, cwd: string): string {
  return execSync(`git ${cmd}`, { cwd, encoding: "utf8" }).trim();
}

/**
 * Fetch from origin — silently skips if there is no remote configured.
 * Useful for local testing / dry runs where no git remote exists yet.
 */
export function fetchOrigin(cwd: string): void {
  try {
    execSync("git fetch origin", { cwd, stdio: "pipe" });
  } catch {
    // no remote or offline — non-fatal
  }
}

/**
 * Returns the remote URL for origin, or null if no remote is configured.
 */
export function getRemoteUrl(cwd: string): string | null {
  try {
    return execSync("git remote get-url origin", { cwd, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

export function remoteBranchExists(branch: string, cwd: string): boolean {
  try {
    execSync(`git ls-remote --exit-code origin refs/heads/${branch}`, { cwd, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function issueToBranch(issue: JiraIssue): string {
  const slug = issue.summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `fix/${issue.key.toLowerCase()}-${slug}`;
}
