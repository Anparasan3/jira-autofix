/**
 * Git helper utilities
 */

import { execSync } from "child_process";
import type { JiraIssue } from "../jiraClient";

export function git(cmd: string, cwd: string): string {
  return execSync(`git ${cmd}`, { cwd, encoding: "utf8" }).trim();
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
