/**
 * buildContext — assembles codebase context fed to the Claude agent.
 *
 * Designed to work in ANY project type (Node, Next.js, React, Python, etc.).
 * Reads from the CWD of the project that installed jira-autofix — not from
 * the jira-autofix package itself.
 *
 * Guide priority (all included if present):
 *   CLAUDE.md              — Claude Code project instructions
 *   AGENTS.md              — generic agent instructions
 *   README.md              — project overview
 *   .jira-autofix/context.md — tool-specific override
 */

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

function readFileSafe(p: string): string {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

export function buildContext(root: string): string {
  const parts: string[] = [];

  // ── 1. Guide files ──────────────────────────────────────────────────────
  const guides = ["CLAUDE.md", "AGENTS.md", "README.md", ".jira-autofix/context.md"];
  for (const name of guides) {
    const content = readFileSafe(join(root, name));
    if (content) parts.push(`## ${name}\n${content}`);
  }

  // ── 2. Root package.json — tech stack & scripts ─────────────────────────
  const pkg = readFileSafe(join(root, "package.json"));
  if (pkg) parts.push(`## package.json\n\`\`\`json\n${pkg}\n\`\`\``);

  // ── 3. Source file tree ─────────────────────────────────────────────────
  // Scan the most common source dirs; skip generated / dependency folders
  const sourceDirs = ["src", "lib", "app", "pages", "components"].filter((d) =>
    existsSync(join(root, d)),
  );

  if (sourceDirs.length > 0) {
    try {
      const tree = execSync(
        `find ${sourceDirs.join(" ")} -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.py" -o -name "*.go" \\) | grep -v node_modules | grep -v .next | grep -v __pycache__ | grep -v dist | grep -v build | sort`,
        { cwd: root, encoding: "utf8" },
      );
      if (tree.trim()) parts.push(`## Source file tree\n\`\`\`\n${tree}\`\`\``);
    } catch {
      // non-fatal
    }
  }

  // ── 4. Barrel / index files — module public APIs ────────────────────────
  if (sourceDirs.length > 0) {
    try {
      const indexFiles = execSync(
        `find ${sourceDirs.join(" ")} \\( -name "index.ts" -o -name "index.tsx" -o -name "index.js" \\) | grep -v node_modules | grep -v .next | grep -v dist | sort`,
        { cwd: root, encoding: "utf8" },
      )
        .split("\n")
        .filter(Boolean);

      const indexSection = indexFiles
        .map((f) => {
          const content = readFileSafe(join(root, f));
          return content ? `### ${f}\n\`\`\`ts\n${content}\n\`\`\`` : "";
        })
        .filter(Boolean)
        .join("\n\n");

      if (indexSection) parts.push(`## Module index files (barrel exports)\n${indexSection}`);
    } catch {
      // non-fatal
    }
  }

  // ── 5. Common entry-point files ─────────────────────────────────────────
  // Detected dynamically — only included when they actually exist
  const entryPointCandidates = [
    "src/index.ts",
    "src/main.ts",
    "src/app.ts",
    "src/server.ts",
    "src/index.js",
    "src/main.js",
    "index.ts",
    "main.ts",
    "index.js",
    "main.js",
  ];

  const entrySection = entryPointCandidates
    .map((f) => {
      const content = readFileSafe(join(root, f));
      return content ? `### ${f}\n\`\`\`ts\n${content}\n\`\`\`` : "";
    })
    .filter(Boolean)
    .join("\n\n");

  if (entrySection) parts.push(`## Entry-point files\n${entrySection}`);

  return parts.join("\n\n");
}
