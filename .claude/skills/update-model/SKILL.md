# Skill: Update the Claude model version

Use this guide when upgrading (or downgrading) the Claude model used in `src/claudeAgent.ts`.

---

## File location

```
src/
└── claudeAgent.ts   ← model ID is passed to client.messages.create()
```

---

## Current model

Set on line ~76 of `src/claudeAgent.ts`:

```ts
const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 8096,
  tools,
  messages,
});
```

---

## Available models (as of 2025)

| Model ID | Speed | Context | Best for |
|---|---|---|---|
| `claude-opus-4-7` | Slow | 200k | Complex multi-file refactors |
| `claude-sonnet-4-6` | Medium | 200k | Default — good balance |
| `claude-haiku-4-5-20251001` | Fast | 200k | Simple, high-volume fixes |

---

## Step 1 — Update the model ID

```ts
// src/claudeAgent.ts
const response = await client.messages.create({
  model: 'claude-opus-4-7',   // ← change this
  max_tokens: 8096,
  tools,
  messages,
});
```

---

## Step 2 — Check `max_tokens`

| Model | Max output tokens |
|---|---|
| Opus 4.7 | 32 000 |
| Sonnet 4.6 | 8 096 |
| Haiku 4.5 | 8 096 |

Raise `max_tokens` if switching to Opus and expecting large file rewrites:

```ts
max_tokens: 16_000,
```

---

## Step 3 — Update the commit message template (optional)

In `src/index.ts`, the `Co-Authored-By` trailer names the model. Update it to match:

```ts
git(
  `commit -m "fix(${issue.key}): …\n\nCo-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"`,
  ROOT,
);
```

---

## Step 4 — Typecheck

```bash
bun run typecheck
```

---

## Step 5 — Test

```bash
DRY_RUN=true bun run start
```

Confirm the correct model appears in Anthropic dashboard usage logs.

---

## Checklist

- [ ] Model ID updated in `client.messages.create()`
- [ ] `max_tokens` adjusted if needed
- [ ] Commit message `Co-Authored-By` trailer updated
- [ ] `bun run typecheck` passes clean
- [ ] Tested with `DRY_RUN=true bun run start`
