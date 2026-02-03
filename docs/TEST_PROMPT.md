# Test Prompt: Unified Context Tool Validation

## Objective

Validate the new unified `context` tool that replaces 6 separate pruning tools and supports advanced pattern matching.

## Tool Interface

```typescript
context({
  action: "discard" | "distill" | "restore",
  targets: [string, string?][]  // [[target, summary?], ...]
})
```

### Target Types (Auto-detected)

- **Tool outputs**: Hash format `r_a1b2c`, `g_d4e5f`, `t_12345` (letter_5hexchars)
- **Messages**: Pattern format `"start...end"`

### Pattern Syntax

- `"start...end"` → e.g. "The quick...lazy dog"
- **Case-insensitive**: Matches are case-insensitive by default.
- **Whitespace-agnostic**: Extra spaces and newlines are ignored during matching.

---

## Test Cases

### Test 1: Basic Discard - Tool Hash

**Setup**: Read a file to generate a tool output with hash
**Action**:

1. Run `read({ filePath: "package.json" })`
2. Use the hash (e.g., `r_a1b2c`) from the output in `context({ action: "discard", targets: [["r_a1b2c"]] })`

**Expected**: Tool output removed from context.

---

### Test 2: Basic Discard - Message Pattern

**Setup**: Write a message: "Let me explain the testing strategy in detail. We need to validate all edge cases."
**Action**: `context({ action: "discard", targets: [["Let me explain...edge cases."]] })`

**Expected**: Message removed from context.

---

### Test 3: Mixed Discard - Tool + Message

**Setup**:

1. `glob({ pattern: "README.md" })`
2. Write message: "Here's a detailed analysis of the architecture..."
   **Action**: `context({ action: "discard", targets: [["g_xxxx"], ["Here's a detailed analysis...architecture"]] })`

**Expected**: Both tool output AND message removed in single call.

---

### Test 4: Distill Tool Output

**Setup**: `glob({ pattern: "**/*.ts" })`
**Action**: `context({ action: "distill", targets: [["g_xxxx", "Found 73 TypeScript files"]] })`

**Expected**: Tool output replaced with summary.

---

### Test 5: Distill Message (with Case & Whitespace variance)

**Setup**: Write message: "ARCHITECTURE OVERVIEW:

1. State
2. UI
3. API"
   **Action**: `context({ action: "distill", targets: [["architecture overview...api", "Summary: 3-layer architecture"]] })`

**Expected**: Message replaced with summary (validates case-insensitive and whitespace-agnostic matching).

---

### Test 6: Mixed Distill - Tool + Message

**Setup**:

1. `read({ filePath: "package.json" })`
2. Write message: "Test results: 10 passed, 0 failed"
   **Action**: `context({ action: "distill", targets: [["r_xxxx", "package.json contents"], ["Test results...failed", "Tests passed"]] })`

**Expected**: Both replaced with summaries in single call.

---

### Test 7: Symmetric Restore - Tool Hash

**Setup**:

1. `read({ filePath: "package.json" })`
2. Discard it: `context({ action: "discard", targets: [["r_xxxx"]] })`
   **Action**: `context({ action: "restore", targets: [["r_xxxx"]] })`

**Expected**: Content restored.

---

### Test 8: Symmetric Restore - Message Pattern (KEY TEST)

**Setup**:

1. Write message: "Testing symmetric restore capability..."
2. Discard it: `context({ action: "discard", targets: [["Testing symmetric...capability"]] })`
   **Action**: `context({ action: "restore", targets: [["Testing symmetric...capability"]] })`

**Expected**: Content restored using the SAME pattern.

---

### Test 9: Batch Operations (Large)

**Setup**: Multiple tool outputs and messages.
**Action**: Single `context` call with 5+ targets (mixed discard/distill is NOT supported in one call, only same action for all targets).

**Expected**: All targets processed correctly.

---

### Test 10: Graceful Error Handling & No-Match

**Action**:

1. Try to distill without summary: `context({ action: "distill", targets: [["r_xxxx"]] })`
2. Try to discard non-existent pattern: `context({ action: "discard", targets: [["Non-existent...pattern"]] })`

**Expected**:

1. Error message indicating summary is required.
2. "Discarded 0 message(s)" or similar empty notification (not an error).

---

## Validation Checklist

- [ ] Tool hashes auto-detected correctly
- [ ] Message patterns auto-detected correctly (Case-insensitive, Whitespace-agnostic)
- [ ] Discard removes content from context
- [ ] Distill replaces content with summary
- [ ] Restore brings back discarded content
- [ ] Symmetric restore works with patterns (same pattern in/out)
- [ ] Mixed targets (tool + message) work in single call
- [ ] Error messages are clear and helpful
- [ ] Token savings reported correctly

---

## Old vs New Comparison

| Aspect           | Old (6 tools)                  | New (1 tool)                |
| ---------------- | ------------------------------ | --------------------------- |
| Tool count       | 6                              | 1                           |
| Parameter shapes | 3 different                    | 1 unified                   |
| Restore workflow | Asymmetric (pattern→hash→hash) | Symmetric (pattern→pattern) |
| Mixed targets    | Impossible                     | Supported                   |
| Matching         | Strict                         | Case & Whitespace agnostic  |
