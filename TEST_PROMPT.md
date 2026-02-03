# Test Prompt: Unified Context Tool Validation

## Objective

Validate the new unified `context` tool that replaces 6 separate pruning tools (discard_tool, discard_msg, distill_tool, distill_msg, restore_tool, restore_msg).

## Tool Interface

```typescript
context({
  action: "discard" | "distill" | "restore",
  targets: [string, string?][]  // [[target, summary?], ...]
})
```

### Target Types (Auto-detected)

- **Tool outputs**: Hash format `r_a1b2c`, `g_d4e5f`, `t_12345` (letter_5hexchars)
- **Messages**: Pattern format `"Let me explain...architecture"`

### Pattern Syntax

- `"start...end"` → matches text starting with 'start' AND ending with 'end'
- `"start..."` → matches text starting with 'start'
- `"...end"` → matches text ending with 'end'

---

## Test Cases

### Test 1: Basic Discard - Tool Hash

**Setup**: Read a file to generate a tool output with hash
**Action**:

```typescript
read({ filePath: "package.json" })
// Note the hash (e.g., r_a1b2c) from the output

context({
    action: "discard",
    targets: [["r_a1b2c"]], // Use actual hash from output
})
```

**Expected**: Tool output removed from context, confirmation message shown

---

### Test 2: Basic Discard - Message Pattern

**Setup**: Write a message that will be matched
**Action**:

```typescript
// First, say something like:
"Let me explain the testing strategy in detail. We need to validate all edge cases."

context({
    action: "discard",
    targets: [["Let me explain...detail"]],
})
```

**Expected**: Message removed from context, confirmation message shown

---

### Test 3: Mixed Discard - Tool + Message

**Setup**: Generate both a tool output and write a message
**Action**:

```typescript
read({ filePath: "README.md" })
// Note the hash

;("Here's a detailed analysis of the architecture...")

context({
    action: "discard",
    targets: [
        ["r_xxxx"], // Use actual tool hash
        ["Here's a detailed analysis..."],
    ],
})
```

**Expected**: Both tool output AND message removed in single call

---

### Test 4: Distill Tool Output

**Setup**: Read a large file
**Action**:

```typescript
read({ filePath: "lib/strategies/tools.ts" })
// Note the hash

context({
    action: "distill",
    targets: [["r_xxxx", "tools.ts: Contains context pruning tool implementations (~1100 lines)"]],
})
```

**Expected**: Tool output replaced with summary, token savings reported

---

### Test 5: Distill Message

**Setup**: Write a verbose message
**Action**:

```typescript
"Let me explain the complete architecture. First, we have the state management layer... [verbose explanation continues]"

context({
    action: "distill",
    targets: [["Let me explain...", "Explained 3-layer architecture"]],
})
```

**Expected**: Message replaced with summary

---

### Test 6: Mixed Distill - Tool + Message

**Setup**: Generate tool output and write message
**Action**:

```typescript
glob({ pattern: "**/*.ts" })
// Note hash

;("Here's a detailed breakdown of the test results...")

context({
    action: "distill",
    targets: [
        ["g_xxxx", "15 TypeScript files found"],
        ["Here's a detailed breakdown...", "Test results analyzed"],
    ],
})
```

**Expected**: Both replaced with summaries in single call

---

### Test 7: Symmetric Restore - Tool Hash

**Setup**: Discard then restore
**Action**:

```typescript
read({ filePath: "package.json" })
// Note hash: r_xxxx

context({ action: "discard", targets: [["r_xxxx"]] })
// Verify removed

context({ action: "restore", targets: [["r_xxxx"]] })
```

**Expected**: Content restored, same hash works for restore

---

### Test 8: Symmetric Restore - Message Pattern (KEY TEST)

**Setup**: Discard with pattern, restore with SAME pattern
**Action**:

```typescript
"Let me explain the testing strategy in detail..."

context({ action: "discard", targets: [["Let me explain...detail"]] })
// Verify removed

context({ action: "restore", targets: [["Let me explain...detail"]] })
```

**Expected**: Content restored using the SAME pattern (no need to remember returned hash)

---

### Test 9: Batch Operations

**Setup**: Multiple operations
**Action**:

```typescript
// Generate multiple tool outputs
read({ filePath: "package.json" })
glob({ pattern: "*.md" })
bash({ command: "ls -la", description: "List files" })
// Note all hashes

context({
    action: "discard",
    targets: [["r_xxxx"], ["g_xxxx"], ["b_xxxx"]],
})

context({
    action: "restore",
    targets: [["r_xxxx"], ["g_xxxx"], ["b_xxxx"]],
})
```

**Expected**: All discarded, all restored

---

### Test 10: Error Handling

**Action**:

```typescript
// Try to distill without summary
context({
    action: "distill",
    targets: [["r_xxxx"]], // Missing summary!
})
```

**Expected**: Error message indicating summary is required

---

## Validation Checklist

- [ ] Tool hashes auto-detected correctly
- [ ] Message patterns auto-detected correctly
- [ ] Discard removes content from context
- [ ] Distill replaces content with summary
- [ ] Restore brings back discarded content
- [ ] Symmetric restore works with patterns (same pattern in/out)
- [ ] Mixed targets (tool + message) work in single call
- [ ] Error messages are clear and helpful
- [ ] Token savings reported correctly
- [ ] System prompt updated with new tool documentation

---

## Report Format

For each test, report:

1. **Test ID**: Test number
2. **Status**: ✅ PASS / ❌ FAIL
3. **Observed**: What actually happened
4. **Issues**: Any problems encountered
5. **Notes**: Additional observations

## Critical Success Criteria

1. **Symmetric restore MUST work** - Using the same pattern to discard and restore
2. **Mixed targets MUST work** - Tool hashes and message patterns in single call
3. **No hash tracking burden** - Agent doesn't need to remember returned hashes
4. **Clear error messages** - Helpful feedback when something goes wrong

---

## Old vs New Comparison

| Aspect           | Old (6 tools)                  | New (1 tool)                |
| ---------------- | ------------------------------ | --------------------------- |
| Tool count       | 6                              | 1                           |
| Parameter shapes | 3 different                    | 1 unified                   |
| Restore workflow | Asymmetric (pattern→hash→hash) | Symmetric (pattern→pattern) |
| Mixed targets    | Impossible                     | Supported                   |

Validate that the new tool is easier to use than the old 6-tool approach.
