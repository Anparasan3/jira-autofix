# Skill: Add a new tool to the Claude agent

Use this guide whenever extending the Claude agent in `src/claudeAgent.ts` with a new capability.

---

## File location

```
src/
└── claudeAgent.ts   ← all tool definitions and handlers live here
```

---

## Step 1 — Define the tool schema

Open `src/claudeAgent.ts` and add an entry to the `tools` array:

```ts
{
  name: 'search_files',
  description: 'Search for a text pattern across source files. Returns matching file paths and line numbers.',
  input_schema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Text or regex pattern to search for',
      },
      dir: {
        type: 'string',
        description: 'Directory to search in, relative to repo root. Defaults to "src".',
      },
    },
    required: ['pattern'],
  },
},
```

**Rules:**
- `name` must be `snake_case`
- `description` must start with an action verb
- Always declare `required` — even if empty: `required: []`

---

## Step 2 — Add the handler

Inside the `toolUses.map(...)` block in `generateFix`, add a new `if` branch **before** the final `return` fallback:

```ts
if (block.name === 'search_files') {
  const dir = join(root, input['dir'] ?? 'src');
  const pattern = input['pattern'] ?? '';
  let result = '(no matches)';
  try {
    result = execSync(`grep -rn ${JSON.stringify(pattern)} ${dir}`, {
      encoding: 'utf8',
      cwd: root,
    });
  } catch {
    result = '(no matches)';
  }
  return { type: 'tool_result', tool_use_id: block.id, content: result };
}
```

---

## Step 3 — Import any new APIs

At the top of `claudeAgent.ts`, add imports as needed:

```ts
import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
```

---

## Step 4 — Typecheck

```bash
bun run typecheck
```

---

## Step 5 — Test the new tool

```bash
DRY_RUN=true bun run start
```

Watch the output — Claude will call the new tool if the issue benefits from it.

---

## Checklist

- [ ] Tool name is `snake_case`
- [ ] Description starts with a verb
- [ ] `input_schema` has all expected properties typed
- [ ] `required` array is present
- [ ] Handler branch added before the fallback `unknown tool` return
- [ ] New imports added at the top of the file
- [ ] `bun run typecheck` passes clean
- [ ] Tested with `DRY_RUN=true bun run start`

---

## Existing tools reference

| Tool | Input | Returns |
|---|---|---|
| `read_file` | `{ path: string }` | File content as string |
| `write_file` | `{ path: string, content: string }` | `"queued"` |
