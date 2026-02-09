# API Reference

ACP provides the `context_prune` tool for intelligent context management.

---

## Tool Interface

```typescript
context_prune({
    action: "discard" | "distill" | "replace",
    targets: [string, string?, string?][]  // Format depends on action
})
```

---

## Target Types

| Type                | Format                    | Example                                        |
| ------------------- | ------------------------- | ---------------------------------------------- |
| **Tool outputs**    | 6 hex chars               | `44136f`, `01cb91`                             |
| **Thinking blocks** | 6 hex chars               | `abc123`                                       |
| **Messages**        | 6 hex chars               | `def456`                                       |
| **Pattern replace** | [start, end, replacement] | `["Start marker:", "End marker.", "[pruned]"]` |

---

## Actions

### Discard

Remove content entirely:

```typescript
context_prune({ action: "discard", targets: [["a1b2c3"]] })
// Response: 「 🗑️ discard ✓ 」- ⚙️ read
```

### Distill

Replace with a summary:

```typescript
context_prune({
    action: "distill",
    targets: [["d4e5f6", "Found 15 TypeScript files"]],
})
```

### Replace

Replace content between markers:

```typescript
context_prune({
    action: "replace",
    targets: [
        ["Detailed findings from analysis:", "End of detailed findings.", "[analysis complete]"],
        ["Debug output started:", "Debug output ended.", "[debug pruned]"],
    ],
})
```

**Pattern Replace Constraints:**

- Match content must be ≥30 characters
- Start OR end pattern must be >15 characters
- Literal matching only (no regex)
- Exactly one match per pattern
- No overlapping patterns

---

## Batch Operations

```typescript
// Discard multiple items at once
context_prune({
    action: "discard",
    targets: [
        ["44136f"], // Tool output
        ["abc123"], // Thinking block
        ["def456"], // Message
    ],
})

// Distill with shared summary
context_prune({
    action: "distill",
    targets: [
        ["44136f", "Research phase complete"],
        ["01cb91", "Research phase complete"],
    ],
})
```

---

## Pruning Workflow

Complete example: execute tool → find hash → prune.

**Step 1: Run a tool**

```typescript
read({ filePath: "src/config.ts" })
// Output includes: <tool_hash>a1b2c3</tool_hash>
```

**Step 2: Find the hash in output**

```
... file contents ...
<tool_hash>a1b2c3</tool_hash>
```

**Step 3: Prune when no longer needed**

```typescript
context_prune({ action: "discard", targets: [["a1b2c3"]] })
// Response: 「 🗑️ discard ✓ 」- ⚙️ read
// Available: Tools(5), Messages(2), Reasoning(1)
```

---

← Back to [README](../README.md)
