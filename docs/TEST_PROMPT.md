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

---

## Auto-Supersede Tests

The auto-supersede system automatically prunes outdated tool outputs. Test these behaviors:

### Test 11: Hash-Based Supersede

**Objective**: Verify identical tool calls supersede old ones.

**Steps**:

1. `read({ filePath: "package.json" })` — Note the hash (e.g., `r_abc12`)
2. Do some other work (at least 1 turn)
3. `read({ filePath: "package.json" })` — Same params, new call
4. Run `/acp stats`

**Expected**:

- First read should be auto-superseded
- Stats show `🔄 hash: 1 prune`
- Only latest read visible in context

---

### Test 12: File-Based Supersede (Write)

**Objective**: Verify write supersedes previous reads of same file.

**Steps**:

1. `read({ filePath: "test-file.txt" })` — Read a file
2. Do some other work (at least 1 turn)
3. `write({ filePath: "test-file.txt", content: "new content" })` — Write to same file
4. Run `/acp stats`

**Expected**:

- Previous read should be auto-superseded
- Stats show `📁 file: 1 prune`
- Only write visible, old read pruned

---

### Test 13: File-Based Supersede (Edit)

**Objective**: Verify edit supersedes previous reads of same file.

**Steps**:

1. `read({ filePath: "package.json" })` — Read a file
2. Do some other work (at least 1 turn)
3. `edit({ filePath: "package.json", oldString: "...", newString: "..." })` — Edit same file
4. Run `/acp stats`

**Expected**:

- Previous read should be auto-superseded
- Stats show `📁 file: 1 prune`

---

### Test 14: Todo-Based Supersede (todowrite)

**Objective**: Verify new todowrite supersedes old todowrite calls.

**Steps**:

1. `todowrite({ todos: [{ id: "1", content: "Task A", status: "pending", priority: "high" }] })`
2. Do some other work
3. `todowrite({ todos: [{ id: "1", content: "Task A", status: "completed", priority: "high" }] })`
4. Run `/acp stats`

**Expected**:

- First todowrite should be auto-superseded
- Stats show `✅ todo: 1 prune`
- Only latest todo state visible

---

### Test 15: Todo-Based Supersede (todoread)

**Objective**: Verify new todoread supersedes old todoread calls.

**Steps**:

1. `todoread()` — Read current todos
2. Do some other work
3. `todoread()` — Read again
4. Run `/acp stats`

**Expected**:

- First todoread should be auto-superseded
- Stats show `✅ todo: 1 prune`

---

### Test 16: No Supersede for Different Files

**Objective**: Verify writes to different files don't supersede unrelated reads.

**Steps**:

1. `read({ filePath: "package.json" })`
2. `write({ filePath: "other-file.txt", content: "..." })`
3. Run `/acp stats`

**Expected**:

- package.json read should NOT be superseded
- Stats show `📁 file: 0 prunes`

---

### Test 17: No Supersede for Protected Tools

**Objective**: Verify protected tools are not superseded.

**Steps**:

1. Ensure a tool is in `protectedTools` config
2. Call that tool twice with same params
3. Run `/acp stats`

**Expected**:

- Neither call should be superseded
- Stats show `🔄 hash: 0 prunes`

---

### Test 18: Combined Auto-Supersede Stats

**Objective**: Verify stats breakdown shows all supersede types.

**Steps**:

1. Trigger hash supersede (same read twice)
2. Trigger file supersede (read then write same file)
3. Trigger todo supersede (todowrite twice)
4. Run `/acp stats`

**Expected**:

```
Strategy Effectiveness:
────────────────────────────────────────────────────────────
  Auto-Supersede         3 prunes, ~X.Xk saved ⭐
    🔄 hash              1 prunes, ~X.Xk
    📁 file              1 prunes, ~X.Xk
    ✅ todo              1 prunes, ~X.Xk
```

---

## Auto-Supersede Validation Checklist

- [ ] Hash-based: Same tool + same params supersedes old call
- [ ] File-based: write/edit supersedes old read/write/edit for same file
- [ ] Todo-based: New todowrite supersedes all old todowrite calls
- [ ] Todo-based: New todoread supersedes all old todoread calls
- [ ] Different files: No cross-file supersede
- [ ] Protected tools: Not superseded
- [ ] Stats: Shows correct breakdown with emoticons
- [ ] Turn protection: Recent turns not superseded

---

## Executable Todo List for Agents

Copy this to `todowrite` to track test execution:

```json
[
    {
        "id": "t1",
        "content": "Test 1: Basic Discard - Tool Hash",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t2",
        "content": "Test 2: Basic Discard - Message Pattern",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t3",
        "content": "Test 3: Mixed Discard - Tool + Message",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t4",
        "content": "Test 4: Distill Tool Output",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t5",
        "content": "Test 5: Distill Message (Case & Whitespace)",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t6",
        "content": "Test 6: Mixed Distill - Tool + Message",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t7",
        "content": "Test 7: Symmetric Restore - Tool Hash",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t8",
        "content": "Test 8: Symmetric Restore - Message Pattern",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t9",
        "content": "Test 9: Batch Operations (Large)",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t10",
        "content": "Test 10: Graceful Error Handling",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t11",
        "content": "Test 11: Hash-Based Supersede",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t12",
        "content": "Test 12: File-Based Supersede (Write)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t13",
        "content": "Test 13: File-Based Supersede (Edit)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t14",
        "content": "Test 14: Todo-Based Supersede (todowrite)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t15",
        "content": "Test 15: Todo-Based Supersede (todoread)",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t16",
        "content": "Test 16: No Supersede for Different Files",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t17",
        "content": "Test 17: No Supersede for Protected Tools",
        "status": "pending",
        "priority": "low"
    },
    {
        "id": "t18",
        "content": "Test 18: Combined Auto-Supersede Stats",
        "status": "pending",
        "priority": "high"
    }
]
```
