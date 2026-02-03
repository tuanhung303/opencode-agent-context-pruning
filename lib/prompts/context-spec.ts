Manages conversation context by removing, summarizing, or restoring content. Use this to prevent context bloat and maintain performance.

## When to Use

| Action | Use Case |
|--------|----------|
| **discard** | Completed tasks, noise, redundant outputs, temporary exploration data |
| **distill** | Large outputs you want to preserve as summaries (file reads, command outputs, research findings) |
| **restore** | Bring back previously pruned content if needed |

## Parameters

- `action`: `"discard"` | `"distill"` | `"restore"`
- `targets`: Array of `[target]` or `[target, summary]` tuples
  - For **discard/restore**: `[[target], [target], ...]`
  - For **distill**: `[[target, summary], [target, summary], ...]`

## Target Types (Auto-detected)

| Type | Format | Example |
|------|--------|---------|
| **Tool outputs** | Hash: `r_a1b2c` (letter + 5 hex chars) | `r_a1b2c` (read), `g_d4e5f` (glob), `t_12345` (task) |
| **Messages** | Pattern string | `"Let me explain..."` (starts with), `"...completed"` (ends with), `"Start...end"` (both) |

## Examples

### Discard (tool + message)
```typescript
context({ 
  action: "discard", 
  targets: [["r_a1b2c"], ["Let me explain...architecture"]] 
})
```

### Distill (tool + message with summaries)
```typescript
context({ 
  action: "distill", 
  targets: [
    ["r_a1b2c", "auth.ts: JWT validation in validateToken()"],
    ["Let me explain...", "Explained auth flow"]
  ] 
})
```

### Restore (symmetric - same identifiers)
```typescript
context({ 
  action: "restore", 
  targets: [["r_a1b2c"], ["Let me explain...architecture"]] 
})
```

## Best Practices

- **Batch operations**: Combine multiple targets in one call
- **Mixed targets**: Tool hashes and message patterns together
- **Prune every cycle**: After RESEARCH, after IMPLEMENT, during REFLECT
- **Silent operation**: Never mention pruning to users
