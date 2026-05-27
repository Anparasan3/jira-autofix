# /add-tool

Add a new tool to the Claude agent in `src/claudeAgent.ts`.

## When to use

When you need Claude to be able to do something new during an autofix run — e.g. list directory contents, delete a file, run shell commands, search for text, etc.

## Where tools live

All tools are defined in `src/claudeAgent.ts`:
- `tools` array — tool schema (name, description, input_schema)
- `toolUses.map(...)` inside `generateFix` — tool execution handler

## Step 1 — Add the schema to the `tools` array

```ts
// src/claudeAgent.ts — tools array

{
  name: 'list_files',
  description: 'List files in a directory. Use to explore the repo structure.',
  input_schema: {
    type: 'object',
    properties: {
      dir: {
        type: 'string',
        description: 'Directory path relative to repo root, e.g. src/utils',
      },
    },
    required: ['dir'],
  },
},
```

## Step 2 — Add the handler in the `toolUses.map(...)` block

```ts
if (block.name === 'list_files') {
  const abs = join(root, input['dir'] ?? '');
  let listing = '(directory does not exist)';
  if (existsSync(abs)) {
    listing = readdirSync(abs, { withFileTypes: true })
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .join('\n');
  }
  return { type: 'tool_result', tool_use_id: block.id, content: listing };
}
```

## Step 3 — Import any new Node/Bun APIs at the top

```ts
import { existsSync, readFileSync, readdirSync } from 'fs';
```

## Step 4 — Typecheck

```bash
bun run typecheck
```

## Step 5 — Test with dry run

```bash
DRY_RUN=true bun run start
```

## Conventions

| Rule | Detail |
|---|---|
| Tool names | `snake_case` |
| Descriptions | Start with a verb — "Read…", "List…", "Search…" |
| Input schema | Always provide `required` array |
| Return content | Plain string; long output is fine (Claude handles it) |
| Errors | Return a descriptive string, never throw — let Claude decide |
| Side effects | Only `write_file` and similar should mutate the repo |

## Existing tools

| Tool | What it does |
|---|---|
| `read_file` | Reads a file relative to repo root |
| `write_file` | Queues a file write (applied after the agentic loop) |
