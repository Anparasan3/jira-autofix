# jira-autofix

> Fetch open Jira issues → auto-fix them with Claude → open GitHub PRs.
> Works in **any** project — just point it at your repo with the env vars below.

[![npm](https://img.shields.io/npm/v/jira-autofix)](https://www.npmjs.com/package/jira-autofix)
[![license](https://img.shields.io/npm/l/jira-autofix)](LICENSE)

---

## How it works

1. Queries Jira for open issues (`To Do`, `Open`, `Backlog`) in your project
2. Reads your project's context — `CLAUDE.md`, `AGENTS.md`, `README.md`, `package.json`, source file tree, barrel exports, and entry-point files
3. Claude reads relevant files in **your** repo and writes the minimal fix
4. Creates a git branch, commits, pushes, and opens a GitHub PR via the GitHub REST API (no `gh` CLI required)
5. Links the PR to the Jira issue and posts a comment in the activity feed

---

## Requirements

| Tool | Version |
|---|---|
| [Bun](https://bun.sh) | ≥ 1.3 |
| Git | any |

No `gh` CLI, no additional installs.

---

## Quick start

```bash
# From YOUR project root
bunx jira-autofix
```

Create a `.env` file in your project root first (see [Setup](#setup)).

---

## Setup

### 1. Environment variables

Create a `.env` file at **your project root** (not inside `node_modules`):

```env
# Jira
JIRA_BASE_URL=https://yourteam.atlassian.net
JIRA_EMAIL=you@example.com
JIRA_API_TOKEN=your_jira_api_token
JIRA_PROJECT_KEY=PROJ

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# GitHub — use GH_PAT locally, GITHUB_TOKEN is auto-set in GitHub Actions
GH_PAT=ghp_...

# Optional
BASE_BRANCH=master
MAX_ISSUES=3
DRY_RUN=false
JIRA_AUTOFIX_MODEL=claude-sonnet-4-6
JIRA_AUTOFIX_MAX_TOKENS=8096
```

Get your Jira API token at: https://id.atlassian.com/manage-profile/security/api-tokens

### 2. Project context (optional but recommended)

Create any of these files in **your repo root** to guide Claude:

| File | Purpose |
|---|---|
| `CLAUDE.md` | Coding rules, architecture, conventions |
| `AGENTS.md` | Generic agent instructions |
| `README.md` | Project overview (always read if present) |
| `.jira-autofix/context.md` | Tool-specific override |

Claude also automatically reads `package.json`, your source file tree, barrel
exports, and key entry-point files — so it understands your stack without any
extra setup.

---

## Usage

```bash
# Standard run — processes up to MAX_ISSUES open issues
bunx jira-autofix

# Dry run — see what would happen without making any commits or PRs
DRY_RUN=true bunx jira-autofix

# Process more issues
MAX_ISSUES=10 bunx jira-autofix

# Use Opus for complex multi-file issues
JIRA_AUTOFIX_MODEL=claude-opus-4-7 JIRA_AUTOFIX_MAX_TOKENS=16000 bunx jira-autofix
```

---

## Pipeline mode (CI — recommended)

Run each stage as a separate job so failures are isolated and retryable:

```bash
# Stage 1 — fetch open issues → jira-issues.json
bunx jira-autofix-fetch

# Stage 2 — generate fixes, commit, push → branches.json
bunx jira-autofix-fix

# Stage 3 — open PRs, link + comment on Jira
bunx jira-autofix-open-prs
```

---

## GitHub Actions

```yaml
name: Jira Auto-Fix

on:
  schedule:
    - cron: '0 */6 * * *'   # every 6 hours
  workflow_dispatch:

jobs:
  fetch:
    name: Fetch Jira issues
    runs-on: ubuntu-latest
    outputs:
      has_issues: ${{ steps.fetch.outputs.has_issues }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: oven-sh/setup-bun@v2
      - name: Fetch issues
        id: fetch
        run: |
          bunx jira-autofix-fetch && echo "has_issues=true" >> $GITHUB_OUTPUT || echo "has_issues=false" >> $GITHUB_OUTPUT
        env:
          JIRA_BASE_URL: ${{ secrets.JIRA_BASE_URL }}
          JIRA_EMAIL: ${{ secrets.JIRA_EMAIL }}
          JIRA_API_TOKEN: ${{ secrets.JIRA_API_TOKEN }}
          JIRA_PROJECT_KEY: ${{ secrets.JIRA_PROJECT_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - uses: actions/upload-artifact@v4
        if: steps.fetch.outputs.has_issues == 'true'
        with:
          name: jira-issues
          path: jira-issues.json

  fix:
    name: Generate fixes
    needs: fetch
    if: needs.fetch.outputs.has_issues == 'true'
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GH_PAT }}
          fetch-depth: 0
      - uses: oven-sh/setup-bun@v2
      - uses: actions/download-artifact@v4
        with:
          name: jira-issues
      - name: Configure Git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
      - name: Generate and push fixes
        run: bunx jira-autofix-fix
        env:
          JIRA_BASE_URL: ${{ secrets.JIRA_BASE_URL }}
          JIRA_EMAIL: ${{ secrets.JIRA_EMAIL }}
          JIRA_API_TOKEN: ${{ secrets.JIRA_API_TOKEN }}
          JIRA_PROJECT_KEY: ${{ secrets.JIRA_PROJECT_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GH_PAT: ${{ secrets.GH_PAT }}
      - uses: actions/upload-artifact@v4
        with:
          name: branches
          path: branches.json

  open-prs:
    name: Open PRs
    needs: fix
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - uses: actions/download-artifact@v4
        with:
          name: branches
      - name: Open PRs + link Jira
        run: bunx jira-autofix-open-prs
        env:
          JIRA_BASE_URL: ${{ secrets.JIRA_BASE_URL }}
          JIRA_EMAIL: ${{ secrets.JIRA_EMAIL }}
          JIRA_API_TOKEN: ${{ secrets.JIRA_API_TOKEN }}
          JIRA_PROJECT_KEY: ${{ secrets.JIRA_PROJECT_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GH_PAT: ${{ secrets.GH_PAT }}
```

### Required GitHub secrets

| Secret | Description |
|---|---|
| `JIRA_BASE_URL` | `https://yourteam.atlassian.net` |
| `JIRA_EMAIL` | Atlassian account email |
| `JIRA_API_TOKEN` | Jira API token |
| `JIRA_PROJECT_KEY` | e.g. `PROJ` |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `GH_PAT` | GitHub PAT with `repo` + `pull_requests:write` scope |

---

## All options

| Env var | Default | Description |
|---|---|---|
| `BASE_BRANCH` | `master` | Branch PRs are opened against |
| `MAX_ISSUES` | `3` | Max issues processed per run |
| `DRY_RUN` | `false` | Preview mode — no commits, pushes, or PRs |
| `JIRA_AUTOFIX_MODEL` | `claude-sonnet-4-6` | Claude model to use |
| `JIRA_AUTOFIX_MAX_TOKENS` | `8096` | Claude max output tokens |

---

## How Claude reads your project

Context is built automatically from your repo root (all optional, any subset works):

| Source | What Claude learns |
|---|---|
| `CLAUDE.md` / `AGENTS.md` | Coding rules, conventions, architecture |
| `README.md` | Project overview, setup |
| `.jira-autofix/context.md` | Tool-specific guide |
| `package.json` | Tech stack, available scripts/libraries |
| Source file tree | What files exist, where things live |
| Barrel/index files | Public API of every module |
| Entry-point files | Component hierarchy (layout, page, main) |

Claude also has three tools: `read_file`, `list_files`, and `write_file` — so it
can explore your project structure on demand before writing any fixes.

---

## Skipping issues

If a branch `fix/<issue-key>-<slug>` already exists on the remote **and** a PR is
already open, the issue is skipped. If the branch exists but has no PR, a PR is
opened immediately without re-running the fix.

---

## License

MIT © [Anparasan](https://github.com/Anparasan3)
