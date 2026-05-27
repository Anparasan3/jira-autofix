import type { JiraIssue } from "./jiraClient";

export interface BranchRecord {
  issueKey: string;
  branch: string;
  title: string;
  body: string;
  pushed: boolean; // true = we committed+pushed this run; false = branch already existed
}

// Re-export so callers that need both can import from one place
export type { JiraIssue };
