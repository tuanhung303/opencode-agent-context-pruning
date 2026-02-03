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

- **Tool outputs**: Hash format `a1b2c3` (6 hex characters, no prefix)
- **Message parts**: Hash format `a1b2c3` (6 hex characters, looked up via `hashToMessagePart`)
- **Reasoning parts**: Hash format `a1b2c3` (6 hex characters, looked up via `hashToReasoningPart`)
- **Bulk patterns**: `[tools]`, `[messages]`, `[*]`, `[all]`

### Pattern Syntax

- **Hash lookup**: Hashes are looked up in state maps (`hashToCallId`, `hashToMessagePart`, `hashToReasoningPart`)
- **Bulk patterns**: `[tools]`, `[messages]`, `[*]`/`[all]` for batch operations
- **Detection order**: tool_hash → message_hash → reasoning_hash → bulk pattern → default to tool_hash

---

## Test Cases

### Test 1: Basic Discard - Tool Hash

**Setup**: Read a file to generate a tool output with hash
**Action**:

1. Run `read({ filePath: "package.json" })`
2. Use the hash (e.g., `abc123`) from the output in `context({ action: "discard", targets: [["abc123"]] })`

**Expected**: Tool output removed from context, added to `prune.toolIds`.

---

### Test 2: Basic Discard - Message Hash

**Setup**: Assistant writes a message that gets a hash assigned via `hashToMessagePart`
**Action**: `context({ action: "discard", targets: [["a1b2c3"]] })` where hash maps to message part

**Expected**: Message part added to `prune.messagePartIds`.

---

### Test 3: Mixed Discard - Tool + Message Hash

**Setup**:

1. `glob({ pattern: "README.md" })` — generates tool hash
2. Assistant message gets hash via `hashToMessagePart`

**Action**: `context({ action: "discard", targets: [["abc123"], ["d4e5f6"]] })`

**Expected**: Both tool output AND message part removed in single call. Both IDs added to respective prune arrays.

---

### Test 4: Distill Tool Output

**Setup**: `glob({ pattern: "**/*.ts" })` — generates hash `abc123`
**Action**: `context({ action: "distill", targets: [["abc123", "Found 73 TypeScript files"]] })`

**Expected**: Tool output added to `prune.toolIds`, summary stored in `softPrunedTools`.

---

### Test 5: Distill Message Hash

**Setup**: Assistant message with hash `a1b2c3` mapped via `hashToMessagePart`
**Action**: `context({ action: "distill", targets: [["a1b2c3", "Summary: 3-layer architecture"]] })`

**Expected**: Message part added to `prune.messagePartIds`, summary stored in `softPrunedMessageParts`.

---

### Test 6: Mixed Distill - Tool + Message Hash

**Setup**:

1. `read({ filePath: "package.json" })` — generates hash `abc123`
2. Message part with hash `d4e5f6`

**Action**: `context({ action: "distill", targets: [["abc123", "package.json contents"], ["d4e5f6", "Tests passed"]] })`

**Expected**: Both added to prune arrays with summaries stored in soft prune caches.

---

### Test 7: Symmetric Restore - Tool Hash

**Setup**:

1. `read({ filePath: "package.json" })` — generates hash `abc123`
2. Discard it: `context({ action: "discard", targets: [["abc123"]] })`

**Action**: `context({ action: "restore", targets: [["abc123"]] })`

**Expected**: Tool ID removed from `prune.toolIds`, content restored from `softPrunedTools`.

---

### Test 8: Symmetric Restore - Message Hash

**Setup**:

1. Message part with hash `a1b2c3` mapped via `hashToMessagePart`
2. Discard it: `context({ action: "discard", targets: [["a1b2c3"]] })`

**Action**: `context({ action: "restore", targets: [["a1b2c3"]] })`

**Expected**: Message part ID removed from `prune.messagePartIds`, content restored from `softPrunedMessageParts`.

---

### Test 9: Bulk Operations - [tools]

**Setup**: Multiple tool outputs with hashes in `hashToCallId`
**Action**: `context({ action: "discard", targets: [["[tools]"]] })`

**Expected**: All eligible tool hashes collected via `collectAllToolHashes`, excluding protected tools and already pruned tools.

---

### Test 10: Bulk Operations - [messages]

**Setup**: Multiple message parts with hashes in `hashToMessagePart`
**Action**: `context({ action: "discard", targets: [["[messages]"]] })`

**Expected**: All eligible message hashes collected via `collectAllMessageHashes`, excluding already pruned message parts.

---

### Test 11: Bulk Operations - [*] / [all]

**Setup**: Mix of tool outputs and message parts with hashes
**Action**: `context({ action: "discard", targets: [["[*]"]] })`

**Expected**: Both tools and messages collected and discarded. Protected tools excluded.

---

### Test 12: Bulk Distill with Summary

**Setup**: Multiple tools in state
**Action**: `context({ action: "distill", targets: [["[tools]", "Research complete"]] })`

**Expected**: All eligible tools distilled with the provided summary.

---

### Test 13: Protected Tools Exclusion

**Setup**: Tools including protected ones (e.g., `task` in `protectedTools` config)
**Action**: `context({ action: "discard", targets: [["[tools]"]] })`

**Expected**: Protected tools NOT included in bulk operation. Only non-protected tools discarded.

---

### Test 14: Graceful Error Handling

**Action**:

1. Try to distill without summary: `context({ action: "distill", targets: [["abc123"]] })`
2. Try to discard non-existent hash: `context({ action: "discard", targets: [["nonexistent"]] })`

**Expected**:

1. Error or graceful handling for missing summary
2. Hash defaults to `tool_hash` type, operation proceeds (may result in 0 discards)

---

## Validation Checklist

- [ ] Tool hashes auto-detected correctly (6 hex chars, no prefix)
- [ ] Message hashes looked up via `hashToMessagePart`
- [ ] Reasoning hashes looked up via `hashToReasoningPart`
- [ ] Bulk patterns `[tools]`, `[messages]`, `[*]`/`[all]` work correctly
- [ ] Discard adds IDs to `prune.toolIds` / `prune.messagePartIds`
- [ ] Distill stores summaries in `softPrunedTools` / `softPrunedMessageParts`
- [ ] Restore removes IDs from prune arrays and retrieves from soft cache
- [ ] Mixed targets (tool + message hash) work in single call
- [ ] Protected tools excluded from bulk operations
- [ ] Error handling for missing summaries on distill

---

## Old vs New Comparison

| Aspect           | Old (6 tools)         | New (1 tool)                   |
| ---------------- | --------------------- | ------------------------------ |
| Tool count       | 6                     | 1                              |
| Parameter shapes | 3 different           | 1 unified                      |
| Target format    | Mixed (hash, pattern) | Hash-based (6 hex chars)       |
| Bulk operations  | Not supported         | `[tools]`, `[messages]`, `[*]` |
| Mixed targets    | Impossible            | Supported                      |
| State tracking   | Scattered             | Centralized prune arrays       |

---

## Auto-Supersede Tests

The auto-supersede system automatically prunes outdated tool outputs. Test these behaviors:

### Test 15: Hash-Based Supersede

**Objective**: Verify identical tool calls supersede old ones.

**Steps**:

1. `read({ filePath: "package.json" })` — Note the hash (e.g., `abc123`)
2. Do some other work (at least 1 turn)
3. `read({ filePath: "package.json" })` — Same params, new call
4. Run `/acp stats`

**Expected**:

- First read should be auto-superseded
- Stats show `🔄 hash: 1 prune`
- Only latest read visible in context

---

### Test 16: File-Based Supersede (Write)

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

### Test 17: File-Based Supersede (Edit)

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

### Test 18: Todo-Based Supersede (todowrite)

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

### Test 19: Todo-Based Supersede (todoread)

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

### Test 20: No Supersede for Different Files

**Objective**: Verify writes to different files don't supersede unrelated reads.

**Steps**:

1. `read({ filePath: "package.json" })`
2. `write({ filePath: "other-file.txt", content: "..." })`
3. Run `/acp stats`

**Expected**:

- package.json read should NOT be superseded
- Stats show `📁 file: 0 prunes`

---

### Test 21: No Supersede for Protected Tools

**Objective**: Verify protected tools are not superseded.

**Steps**:

1. Ensure a tool is in `protectedTools` config
2. Call that tool twice with same params
3. Run `/acp stats`

**Expected**:

- Neither call should be superseded
- Stats show `🔄 hash: 0 prunes`

---

### Test 22: Combined Auto-Supersede Stats

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

## Stuck Task Detection Tests

Tests for the stuck task detection feature that suggests breaking down tasks when they've been `in_progress` for too long.

### Test 23: Stuck Task Detection - Basic

**Objective**: Verify stuck task guidance appears after threshold turns.

**Steps**:

1. `todowrite({ todos: [{ id: "1", content: "Complex task", status: "in_progress", priority: "high" }] })`
2. Do work for 12+ turns without updating the todo
3. Wait for todo reminder to appear

**Expected**:

- Reminder includes "⚠️ **Task Breakdown Suggestion**"
- Shows number of turns the task has been in progress
- Suggests breaking into smaller subtasks

---

### Test 24: Stuck Task Detection - Timestamp Preservation

**Objective**: Verify `inProgressSince` is preserved when task stays in_progress.

**Steps**:

1. `todowrite({ todos: [{ id: "1", content: "Task A", status: "in_progress", priority: "high" }] })` at turn 3
2. Do work for 5 turns
3. `todowrite({ todos: [{ id: "1", content: "Task A (updated)", status: "in_progress", priority: "high" }] })` at turn 8
4. Continue for 7 more turns (total 12 from original)

**Expected**:

- Stuck task guidance appears at turn 15 (12 turns since turn 3)
- NOT at turn 20 (12 turns since turn 8)
- `inProgressSince` preserved from first transition

---

### Test 25: Stuck Task Detection - New Task Transition

**Objective**: Verify `inProgressSince` is set when task transitions to in_progress.

**Steps**:

1. `todowrite({ todos: [{ id: "1", content: "Task A", status: "pending", priority: "high" }] })` at turn 1
2. Do work for 5 turns
3. `todowrite({ todos: [{ id: "1", content: "Task A", status: "in_progress", priority: "high" }] })` at turn 6
4. Continue for 12 turns

**Expected**:

- Stuck task guidance appears at turn 18 (12 turns since turn 6)
- NOT based on turn 1 when task was pending

---

### Test 26: Stuck Task Detection - Multiple Stuck Tasks

**Objective**: Verify guidance shows longest stuck duration when multiple tasks are stuck.

**Steps**:

1. `todowrite({ todos: [{ id: "1", content: "Task A", status: "in_progress", priority: "high" }] })` at turn 2
2. `todowrite({ todos: [{ id: "1", ..., status: "in_progress" }, { id: "2", content: "Task B", status: "in_progress", priority: "medium" }] })` at turn 8
3. Continue for 12+ turns from turn 2

**Expected**:

- Guidance shows "in progress for 14 turns" (based on Task A, not Task B)
- Both tasks detected as stuck

---

### Test 27: Stuck Task Detection - Completed Task Clears

**Objective**: Verify completing a task removes it from stuck detection.

**Steps**:

1. `todowrite({ todos: [{ id: "1", content: "Task A", status: "in_progress", priority: "high" }] })` at turn 1
2. Do work for 10 turns
3. `todowrite({ todos: [{ id: "1", content: "Task A", status: "completed", priority: "high" }] })` at turn 11
4. Continue for 5 more turns

**Expected**:

- No stuck task guidance appears
- Completed tasks don't trigger stuck detection

---

## Reminder Deduplication Tests

Tests to verify only one reminder of each type exists at any time.

### Test 28: Todo Reminder Deduplication

**Objective**: Verify old todo reminders are removed before new injection.

**Steps**:

1. Don't update todos for 8+ turns (trigger first reminder)
2. Continue without updating for 4+ more turns (trigger second reminder)
3. Check context

**Expected**:

- Only ONE "📋 **Todo Review Reminder**" exists in context
- Old reminder removed before new one injected

---

### Test 29: Automata Reflection Deduplication

**Objective**: Verify old automata reflections are removed before new injection.

**Steps**:

1. Trigger automata mode with keyword
2. Work for 8+ turns (trigger first reflection)
3. Continue for 8+ more turns (trigger second reflection)
4. Check context

**Expected**:

- Only ONE "🤖 **Strategic Reflection**" exists in context
- Old reflection removed before new one injected

---

### Test 30: Mixed Reminders Coexistence

**Objective**: Verify todo reminder and automata reflection can coexist (one of each).

**Steps**:

1. Trigger automata mode
2. Create todos but don't update for 8+ turns
3. Check context

**Expected**:

- One "📋 **Todo Review Reminder**" present
- One "🤖 **Strategic Reflection**" present
- Both can coexist, but only one of each type

---

## Thinking Block & Assistant Message Pruning Tests

Tests for pruning thinking blocks and assistant messages from context.

### Test 31: Pruning Thinking Blocks

**Objective**: Verify thinking blocks can be pruned via hash.

**Steps**:

1. Enable extended thinking mode
2. Perform a task that generates a thinking block with hash (e.g., `abc123`)
3. Note the hash from the thinking block
4. `context({ action: "discard", targets: [["abc123"]] })` where hash maps to reasoning part

**Expected**:

- Thinking block added to `prune.reasoningPartIds`
- Thinking content removed from context
- Hash looked up via `hashToReasoningPart` map

---

### Test 32: Pruning Assistant Messages

**Objective**: Verify assistant messages can be pruned via hash or bulk pattern.

**Steps**:

1. Assistant writes several messages during conversation
2. Note the hash from a message (e.g., `d4e5f6`)
3. Test individual: `context({ action: "discard", targets: [["d4e5f6"]] })`
4. Test bulk: `context({ action: "discard", targets: [["[messages]"]] })`

**Expected**:

- Individual: Message part added to `prune.messagePartIds`
- Bulk: All eligible message parts discarded
- Message content shows `[Assistant message part removed to save context]`

---

### Test 33: Distill Thinking Block

**Objective**: Verify thinking blocks can be distilled with summary.

**Steps**:

1. Generate thinking block with hash `abc123`
2. `context({ action: "distill", targets: [["abc123", "Analyzed architecture patterns"]] })`

**Expected**:

- Thinking block added to `prune.reasoningPartIds`
- Summary stored in `softPrunedReasoningParts`
- Original thinking replaced with distilled summary

---

### Test 34: Bulk Prune All Content Types

**Objective**: Verify `[*]` prunes tools, messages, AND thinking blocks.

**Steps**:

1. Generate tool outputs (read, glob, etc.)
2. Generate assistant messages
3. Generate thinking blocks (if extended thinking enabled)
4. `context({ action: "discard", targets: [["[*]"]] })`

**Expected**:

- All tool outputs pruned (except protected)
- All assistant messages pruned
- All thinking blocks pruned
- Stats show combined count

---

## Thinking Block & Message Pruning Validation Checklist

- [ ] Thinking block hashes looked up via `hashToReasoningPart`
- [ ] Message hashes looked up via `hashToMessagePart`
- [ ] Individual discard works for thinking blocks
- [ ] Individual discard works for messages
- [ ] Bulk `[messages]` discards all eligible messages
- [ ] Bulk `[*]` discards tools, messages, and thinking blocks
- [ ] Distill works for thinking blocks with summary
- [ ] Distill works for messages with summary
- [ ] Restore works for thinking blocks
- [ ] Restore works for messages

---

## Stuck Task Detection Validation Checklist

- [ ] `inProgressSince` set when task transitions to `in_progress`
- [ ] `inProgressSince` preserved when task stays `in_progress`
- [ ] `inProgressSince` cleared when task completes/cancels
- [ ] Guidance appears after `stuckTaskTurns` threshold (default: 12)
- [ ] Guidance shows longest stuck duration for multiple stuck tasks
- [ ] Guidance suggests breaking into smaller subtasks
- [ ] Config `stuckTaskTurns` is respected

## Reminder Deduplication Validation Checklist

- [ ] Only one todo reminder exists at any time
- [ ] Only one automata reflection exists at any time
- [ ] Old reminders removed before new injection
- [ ] Different reminder types can coexist

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
        "content": "Test 2: Basic Discard - Message Hash",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t3",
        "content": "Test 3: Mixed Discard - Tool + Message Hash",
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
        "content": "Test 5: Distill Message Hash",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t6",
        "content": "Test 6: Mixed Distill - Tool + Message Hash",
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
        "content": "Test 8: Symmetric Restore - Message Hash",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t9",
        "content": "Test 9: Bulk Operations - [tools]",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t10",
        "content": "Test 10: Bulk Operations - [messages]",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t11",
        "content": "Test 11: Bulk Operations - [*]/[all]",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t12",
        "content": "Test 12: Bulk Distill with Summary",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t13",
        "content": "Test 13: Protected Tools Exclusion",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t14",
        "content": "Test 14: Graceful Error Handling",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t15",
        "content": "Test 15: Hash-Based Supersede",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t16",
        "content": "Test 16: File-Based Supersede (Write)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t17",
        "content": "Test 17: File-Based Supersede (Edit)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t18",
        "content": "Test 18: Todo-Based Supersede (todowrite)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t19",
        "content": "Test 19: Todo-Based Supersede (todoread)",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t20",
        "content": "Test 20: No Supersede for Different Files",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t21",
        "content": "Test 21: No Supersede for Protected Tools",
        "status": "pending",
        "priority": "low"
    },
    {
        "id": "t22",
        "content": "Test 22: Combined Auto-Supersede Stats",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t23",
        "content": "Test 23: Stuck Task Detection - Basic",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t24",
        "content": "Test 24: Stuck Task Detection - Timestamp Preservation",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t25",
        "content": "Test 25: Stuck Task Detection - New Task Transition",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t26",
        "content": "Test 26: Stuck Task Detection - Multiple Stuck Tasks",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t27",
        "content": "Test 27: Stuck Task Detection - Completed Task Clears",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t28",
        "content": "Test 28: Todo Reminder Deduplication",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t29",
        "content": "Test 29: Automata Reflection Deduplication",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t30",
        "content": "Test 30: Mixed Reminders Coexistence",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t31",
        "content": "Test 31: Pruning Thinking Blocks",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t32",
        "content": "Test 32: Pruning Assistant Messages",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t33",
        "content": "Test 33: Distill Thinking Block",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t34",
        "content": "Test 34: Bulk Prune All Content Types",
        "status": "pending",
        "priority": "high"
    }
]
```
