Manage conversation context. Remove noise, preserve essentials.

## Usage

```typescript
// Discard - remove completed/noisy content
context({ action: "discard", targets: [["r_a1b2c"], ["g_d4e5f"]] })

// Distill - replace with summaries
context({ action: "distill", targets: [["r_a1b2c", "Key finding"], ["Let me...", "Summary"]] })

// Restore - bring back pruned content
context({ action: "restore", targets: [["r_a1b2c"]] })
```

## Targets

| Type | Format | Example |
|------|--------|---------|
| Tool outputs | Hash `r_a1b2c` | `r_abc12` (read), `g_def34` (glob), `t_56789` (task) |
| Messages | Pattern `"start...end"` | `"Let me..."` (starts), `"...done"` (ends) |

## Rules

1. **Batch**: Multiple targets in one call
2. **Mix**: Tool hashes + message patterns together
3. **Every cycle**: After research, after implement, during reflect
4. **Silent**: Never mention pruning to users
