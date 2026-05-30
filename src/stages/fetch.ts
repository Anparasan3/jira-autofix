#!/usr/bin/env bun
/**
 * Stage 1 — fetch
 *
 * Fetches open Jira issues for the configured project and writes them to
 * `jira-issues.json` in the current working directory.
 *
 * Exit code 1 when no issues are found so downstream CI jobs can skip
 * automatically via `if: success()`.
 *
 * Usage (from your project root):
 *   bunx jira-autofix-fetch
 *   bun run jira-autofix:fetch   # if added to your project's package.json scripts
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { loadConfig } from "../core/config";
import { JiraClient } from "../jira/client";
import type { JiraIssue } from "../jira/client";

const cfg = loadConfig();

const jira = new JiraClient({
  baseUrl: cfg.jiraBaseUrl,
  email: cfg.jiraEmail,
  apiToken: cfg.jiraApiToken,
});

console.log(`jira-autofix fetch  |  project: ${cfg.jiraProjectKey}  |  max: ${cfg.maxIssues}`);

const issues: JiraIssue[] = await jira.fetchOpenIssues(cfg.jiraProjectKey, cfg.maxIssues);

if (issues.length === 0) {
  console.log("✅  No open issues found.");
  process.exit(1);
}

console.log(`\nFound ${issues.length} issue(s):`);
for (const i of issues) console.log(`  ${i.key}  [${i.issueType}]  ${i.summary}`);

const outPath = join(process.cwd(), "jira-issues.json");
writeFileSync(outPath, JSON.stringify(issues, null, 2), "utf8");
console.log(`\nWrote ${outPath}`);
