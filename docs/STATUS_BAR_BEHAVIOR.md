# ACP Status Bar Behavior

## What is the Status Bar?

The status bar appears as:

```
「 💬 15(7.5K) ▼ + 🧠 8(16K) ▼ + ⚙️ 39(83.1K) ▼ 」
```

**Meaning:**

- 💬 **15 messages** pruned, **7.5K tokens** saved
- 🧠 **8 thinking blocks** pruned, **16K tokens** saved
- ⚙️ **39 tools** pruned, **83.1K tokens** saved

## When Does It Appear?

✅ **Appears after:**

1. Successful `context({ action: "discard", ... })` that actually prunes items
2. Successful `context({ action: "distill", ... })` that actually distills items
3. Auto-supersede operations that remove duplicate content

**Condition:** `pruneNotification` config must NOT be set to `"off"`

## When Does It Disappear?

❌ **Disappears when:**

### 1. Config is Disabled

```jsonc
// opencode.jsonc
{
    "commands": {
        "pruneNotification": "off", // Status will NEVER appear
    },
}
```

**Fix:** Change to `"minimal"` (default) or `"detailed"`

### 2. No-Op Operations

If you run `context()` but nothing was actually pruned:

- All targets were already pruned
- All targets are protected tools
- Invalid hashes provided

**Example:**

```typescript
context({ action: "discard", targets: [["invalid_hash"]] })
// → No status appears (nothing was pruned)
```

### 3. Context Compaction (Expected Behavior)

OpenCode periodically **compacts** the conversation by removing old messages to save tokens.

**What happens:**

1. You run `context()` → Status message is created
2. OpenCode compacts context → Old messages removed
3. Status message is part of removed messages
4. Status appears to "disappear"

**This is NOT a bug** — it's working as designed. The status is a **notification**, not a **persistent dashboard**.

**Why we don't re-send:**

- Re-sending would create duplicate messages
- Would spam the user every time compaction happens
- Adds unnecessary token usage
- The `/acp stats` command already provides persistent stats

### 4. Different Response Types

The status appears in different formats:

| Format          | When                       | Example                                              |
| --------------- | -------------------------- | ---------------------------------------------------- |
| **Line 1**      | After context operation    | `「 💬 15(7.5K) ▼ + 🧠 8(16K) ▼ + ⚙️ 39(83.1K) ▼ 」` |
| **Tool output** | With pruning details       | `🗑️ discard ✓ 14 manual`                             |
| **Hidden**      | `pruneNotification: "off"` | Nothing shown                                        |

## How to Check Status On Demand

If the status disappeared, use ACP commands:

### `/acp stats`

Shows detailed pruning statistics:

```
╭───────────────────────────────────────────────────────────╮
│                    ACP Statistics                         │
╰───────────────────────────────────────────────────────────╯

Session:
────────────────────────────────────────────────────────────
  Tokens pruned: ~40K
  Tools pruned:   41

Strategy Effectiveness:
────────────────────────────────────────────────────────────
  Manual Discard     41 prunes, ~40K saved ⭐
    💬 message       15 prunes, ~7.5K
    🧠 thinking       8 prunes, ~16K
    ⚙️ tool          18 prunes, ~16.5K
```

### `/acp budget`

Shows current context budget:

```
╭───────────────────────────────────────────────────────────╮
│                    Context Budget                         │
╰────────────────────────────────────────────────────────────╯

📊 Current Usage:
   Total:     45.2K tokens
   Tools:     12.3K tokens (18 tools)

✂️  Pruning History:
   Total tokens saved: 40K
   Total tools pruned: 41
```

## Configuration Reference

### opencode.jsonc

```jsonc
{
    "commands": {
        // Status bar visibility
        "pruneNotification": "minimal", // ✅ Shows compact status (default)
        // "pruneNotification": "detailed", // Shows full breakdown
        // "pruneNotification": "off",      // ❌ Never shows status
    },
}
```

### .opencode/acp.jsonc

```jsonc
{
    "$schema": "https://raw.githubusercontent.com/opencode-acp/opencode-acp/master/acp.schema.json",
    "pruneNotification": "minimal",
}
```

## Troubleshooting

### "Status never appears"

1. Check config: `pruneNotification` should be `"minimal"` or `"detailed"`
2. Verify pruning actually happened: Check `/acp stats`
3. Check for errors in tool output

### "Status appears then disappears"

**This is expected behavior — NOT a bug.**

The status is a **notification message**, not a persistent UI element. When OpenCode compacts the conversation (to save tokens), old messages including the status notification are removed.

**Correct workflow:**

1. See status immediately after `context()` call
2. Status may disappear later (compaction)
3. Use `/acp stats` to check history anytime

**Do NOT expect status to persist** — it's ephemeral by design.

### "Status shows 0 for everything"

```
「 acp 」  // Empty status
```

This means no pruning has occurred yet. Run some discard/distill operations.

## Best Practices

1. **Don't rely on status persistence** — It's a notification, not a dashboard
2. **Use `/acp stats` for history** — Permanent record of pruning activity
3. **Check `/acp budget` for current state** — Live context usage
4. **Keep `pruneNotification: "minimal"`** — Good balance of info and noise

## Summary

| Situation                | Status Shown? | Solution                          |
| ------------------------ | ------------- | --------------------------------- |
| After successful prune   | ✅ Yes        | Normal                            |
| Config = `"off"`         | ❌ No         | Change to `"minimal"`             |
| Nothing was pruned       | ❌ No         | Check targets are valid           |
| After context compaction | ❌ No         | Use `/acp stats`                  |
| Need persistent view     | ❌ No         | Run `/acp stats` or `/acp budget` |
