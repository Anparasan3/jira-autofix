/**
 * Claude agent — reads files from the host project and writes fixes using tool use.
 *
 * Tools available to Claude:
 *   read_file   — read any file relative to the project root
 *   list_files  — list files in a directory (helps Claude explore unknown structures)
 *   write_file  — queue a file write (applied by the caller after the loop)
 *
 * Codebase context is prompt-cached so repeated calls in the same run are cheap.
 */

import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "child_process";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import type { JiraIssue } from "../jira/client";

export interface FileChange {
  path: string;
  content: string;
}

// ── Internal helpers ────────────────────────────────────────────────────────

/**
 * Safely extract a string property from an unknown tool-input object.
 * Anthropic's SDK types `ToolUseBlock.input` as `unknown`; this helper
 * avoids scattered `as` casts throughout the tool handlers.
 */
function getStringInput(input: unknown, key: string): string {
  if (typeof input !== "object" || input === null) return "";
  const val = (input as Record<string, unknown>)[key];
  return typeof val === "string" ? val : "";
}

// ── Tool schemas ────────────────────────────────────────────────────────────

const tools: Anthropic.Tool[] = [
  {
    name: "read_file",
    description:
      "Read a file from the project. Use this to understand existing code before making changes.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path relative to the project root, e.g. src/utils/helpers.ts",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "list_files",
    description:
      "List files and directories inside a folder. Use this to explore the project structure before deciding which files to read.",
    input_schema: {
      type: "object",
      properties: {
        dir: {
          type: "string",
          description:
            'Directory path relative to the project root, e.g. src/components. Defaults to "." (project root).',
        },
      },
      required: [],
    },
  },
  {
    name: "write_file",
    description:
      "Write or update a file with the fix. Always read the file first if it already exists. You MUST call this at least once to deliver the fix.",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path relative to the project root",
        },
        content: {
          type: "string",
          description: "Complete new file content (not a diff — the full file)",
        },
      },
      required: ["path", "content"],
    },
  },
];

// ── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert software engineer fixing Jira issues in a codebase.

The context you receive includes:
- CLAUDE.md / AGENTS.md with coding rules and architecture notes — follow these strictly.
- README.md with a project overview and setup instructions.
- package.json files showing the tech stack and available libraries.
- A full source file tree so you know exactly which files exist.
- Barrel/index files that show the public API of every module — use these to understand
  what components, hooks, and utilities are already available before reaching for read_file.
- Key entry-point files (layout, page, main) so you understand the component hierarchy.

Rules:
- Use the context (file tree, barrel files, entry-points) before calling read_file or list_files.
- Only call read_file for files whose implementation you genuinely need to see.
- Use list_files when the project structure is unclear and you need to explore a directory.
- Always use write_file to deliver the fix — you MUST write at least one file.
- If the issue is vague, make a reasonable best-effort implementation based on the issue
  title, file tree, and available components.
- Apply the minimal change needed. Do not refactor unrelated code.
- Follow all coding conventions found in CLAUDE.md or AGENTS.md exactly.
- Never leave a fix unimplemented. If unsure of the exact change, implement the most
  likely interpretation.`;

// ── Agent loop ──────────────────────────────────────────────────────────────

export async function generateFix(
  issue: JiraIssue,
  context: string,
  root: string,
  apiKey: string,
  model = "claude-sonnet-4-6",
  maxTokens = 8096,
): Promise<FileChange[]> {
  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: context,
          // prompt-caching beta field — not yet in the official SDK typings
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: [
            `Fix the following Jira issue by reading relevant files and writing the fix with write_file.`,
            `You MUST call write_file at least once — do not end the turn without writing a file.\n`,
            `**${issue.key} [${issue.issueType}]: ${issue.summary}**\n`,
            issue.description
              ? `Description:\n${issue.description}`
              : `(no description — use the issue title to infer the required change)`,
          ].join("\n"),
        },
      ],
    },
  ];

  const changes: FileChange[] = [];

  // ── Retry helper ──────────────────────────────────────────────────────────
  // Typed as MessageCreateParamsNonStreaming so the SDK resolves the overload to
  // Promise<Message> — avoiding a return-type union with Stream.
  async function callWithRetry(
    payload: Anthropic.MessageCreateParamsNonStreaming,
    attempt = 0,
  ): Promise<Anthropic.Message> {
    try {
      return await client.messages.create(payload);
    } catch (err) {
      if (attempt >= 3) {
        console.error("  ✗  Claude API call failed after 4 attempts");
        throw new Error("Claude API call failed after retries", { cause: err });
      }
      const wait = 2 ** attempt * 2000; // 2 s, 4 s, 8 s
      console.log(`  ⚠  API error (attempt ${attempt + 1}/4) — retrying in ${wait / 1000}s…`);
      await new Promise((r) => setTimeout(r, wait));
      return callWithRetry(payload, attempt + 1);
    }
  }

  // ── Agentic loop ───────────────────────────────────────────────────────────
  for (let i = 0; i < 12; i++) {
    const response = await callWithRetry({
      model,
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    // Log Claude's first line of reasoning and every tool call
    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) {
        console.log(`  🤖  ${block.text.trim().split("\n")[0]}`);
      }
      if (block.type === "tool_use") {
        if (block.name === "read_file")
          console.log(`  📖  read        ${getStringInput(block.input, "path")}`);
        if (block.name === "list_files")
          console.log(`  📂  list_files  ${getStringInput(block.input, "dir") || "."}`);
        if (block.name === "write_file")
          console.log(`  ✏️   write       ${getStringInput(block.input, "path")}`);
      }
    }

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      // Nudge once if Claude finished without writing anything
      if (changes.length === 0) {
        console.log("  🔁  No files written yet — prompting Claude to write the fix…");
        messages.push({
          role: "user",
          content:
            "You have read and analysed the files but have not called write_file yet. " +
            "Please now implement the fix by calling write_file. You must write at least one file.",
        });
        continue;
      }
      break;
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (toolUses.length === 0) break;

    const results: Anthropic.ToolResultBlockParam[] = toolUses.map((block) => {
      // ── read_file ────────────────────────────────────────────────────────
      if (block.name === "read_file") {
        const filePath = getStringInput(block.input, "path");
        const abs = join(root, filePath);
        const content = existsSync(abs) ? readFileSync(abs, "utf8") : "(file does not exist)";
        return { type: "tool_result", tool_use_id: block.id, content };
      }

      // ── list_files ───────────────────────────────────────────────────────
      if (block.name === "list_files") {
        const dir = getStringInput(block.input, "dir") || ".";
        const abs = join(root, dir);
        if (!existsSync(abs)) {
          return {
            type: "tool_result",
            tool_use_id: block.id,
            content: "(directory does not exist)",
          };
        }
        try {
          const entries = readdirSync(abs, { withFileTypes: true })
            .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules")
            .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
            .join("\n");
          return {
            type: "tool_result",
            tool_use_id: block.id,
            content: entries || "(empty directory)",
          };
        } catch {
          try {
            const out = execSync(`find . -maxdepth 2 -not -path "*/node_modules/*" | sort`, {
              cwd: abs,
              encoding: "utf8",
            });
            return { type: "tool_result", tool_use_id: block.id, content: out };
          } catch {
            return {
              type: "tool_result",
              tool_use_id: block.id,
              content: "(could not list directory)",
            };
          }
        }
      }

      // ── write_file ───────────────────────────────────────────────────────
      if (block.name === "write_file") {
        const filePath = getStringInput(block.input, "path");
        const content = getStringInput(block.input, "content");
        changes.push({ path: filePath, content });
        return { type: "tool_result", tool_use_id: block.id, content: "queued" };
      }

      return { type: "tool_result", tool_use_id: block.id, content: "unknown tool" };
    });

    messages.push({ role: "user", content: results });
  }

  return changes;
}
