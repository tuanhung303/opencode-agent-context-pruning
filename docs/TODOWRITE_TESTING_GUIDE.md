# Todo Write Tool Testing Guide

**Purpose**: Document comprehensive testing patterns for the `todowrite` tool and stuck task detection mechanism.

---

## Table of Contents

1. [Test Overview](#test-overview)
2. [Context Pruning Tests](#context-pruning-tests)
3. [Todo Reminder Timing Tests](#todo-reminder-timing-tests)
4. [Todo-Based Supersede Tests](#todo-based-supersede-tests)
5. [Stuck Task Detection Tests](#stuck-task-detection-tests)
6. [Bug Discovery: Output Parsing](#bug-discovery-output-parsing)
7. [Test Execution Patterns](#test-execution-patterns)

---

## Test Overview

This guide documents the complete testing suite performed on the ACP (Agentic Context Pruning) plugin, with special focus on `todowrite` tool behavior, reminder timing, and stuck task detection mechanisms.

**Key Findings**:

- ✅ Todo reminder fires at correct intervals (8 turns initial, 4 turns repeat)
- ✅ Only ONE reminder exists in context at a time (auto-deduplication)
- ✅ Todo-based supersede works (one-todo-one-view policy)
- 🐛 **Bug found**: `inProgressSince` not set due to output parsing issue
- ✅ **Bug fixed**: Now handles both string and object output formats

---

## Context Pruning Tests

### Test 1: Discard Thinking Blocks

**Purpose**: Verify thinking blocks can be discarded to free context.

```typescript
// Discard a specific thinking block
context({ action: "discard", targets: [["abc123"]] })

// Discard all thinking blocks
context({ action: "discard", targets: [["[thinking]"]] })
```

**Expected**: Thinking blocks removed, status shows "🗑️ discard ✓"

---

### Test 2: Discard Messages

**Purpose**: Verify assistant messages can be pruned.

```typescript
context({ action: "discard", targets: [["def456"]] })

// Bulk discard all messages
context({ action: "discard", targets: [["[messages]"]] })
```

**Note**: Only assistant messages can be discarded, not user messages.

---

### Test 3: Discard Tool Outputs

**Purpose**: Verify tool outputs can be targeted for pruning.

```typescript
// Run some tools first
grep({ pattern: "test", include: "*.md" })
glob({ pattern: "docs/*.md" })
bash({ command: "echo 'hello'" })

// Then discard them
context({ action: "discard", targets: [["717b72"], ["44136f"]] })

// Or discard all tool outputs
context({ action: "discard", targets: [["[tools]"]] })
```

**Result**: "🗑️ discard ✓ 11 manual" — All specified tools pruned

---

## Todo Reminder Timing Tests

### Test 4: Verify Reminder Intervals

**Configuration**:

```jsonc
{
    "tools": {
        "todoReminder": {
            "enabled": true,
            "initialTurns": 8, // First reminder after 8 turns
            "repeatTurns": 4, // Subsequent reminders every 4 turns
            "stuckTaskTurns": 12, // Stuck detection threshold
        },
    },
}
```

**Test Sequence**:

```
Turn 0:  todowrite() called (resets counter)
Turn 8:  🔖 First reminder (if no todowrite since turn 0)
Turn 12: 🔖 Repeat reminder
Turn 16: 🔖 Repeat reminder
Turn 20: 🔖 Repeat reminder
...
```

**Execution**:

```typescript
// Create initial todo
todowrite({
    todos: [
        {
            id: "test-task",
            content: "Test reminder timing",
            status: "in_progress",
            priority: "high",
        },
    ],
})

// Fire 30 echo commands without updating todo
// This triggers reminders at turns 8, 12, 16, 20, 24, 28
bash({ command: "echo 1" })
bash({ command: "echo 2" })
// ... 30 times
```

**Expected**: Reminder appears with "I've noticed your todo list hasn't been updated for {turns} turns"

---

### Test 5: Reminder Deduplication

**Purpose**: Verify only ONE reminder exists in context at a time.

**Method**:

1. Wait for first reminder at turn 8
2. Continue without updating todo
3. At turn 12, second reminder fires
4. First reminder is automatically removed

**Verification**: Check context — only the latest reminder should be visible.

**Code Logic** (`todo-reminder.ts:133-134`):

```typescript
// Remove any existing reminder messages first (ensure only one exists)
removeTodoReminder(state, messages, logger)
```

**Result**: ✅ Only one reminder visible at any time

---

### Test 6: Sequential Echo with Todo Updates

**Purpose**: Verify reminder is suppressed when todo is actively updated.

**Execution**:

```typescript
// Update todo every turn — no reminder should fire
todowrite({ todos: [{ id: "echo-test", content: "Step 1", status: "in_progress" }] })
bash({ command: "echo 1" })

todowrite({ todos: [{ id: "echo-test", content: "Step 2", status: "in_progress" }] })
bash({ command: "echo 2" })

todowrite({ todos: [{ id: "echo-test", content: "Step 3", status: "in_progress" }] })
bash({ command: "echo 3" })
// ... continue to step 10

todowrite({ todos: [{ id: "echo-test", content: "Step 10", status: "completed" }] })
bash({ command: "echo 10" })
```

**Expected**: **NO reminder fires** because `lastTurn` is reset each time.

**Result**: ✅ No reminder appeared during 10-turn sequence

---

## Todo-Based Supersede Tests

### Test 7: One-Todo-One-View Policy

**Purpose**: Verify only the latest todo state is retained.

**Execution**:

```typescript
// First update
todowrite({
    todos: [{ id: "1", content: "task1", status: "pending", priority: "high" }],
})

// Second update (supersedes first)
todowrite({
    todos: [{ id: "1", content: "task1", status: "in_progress", priority: "high" }],
})

// Third update (supersedes second)
todowrite({
    todos: [{ id: "1", content: "task1", status: "completed", priority: "high" }],
})
```

**Expected**: Only the third todowrite output remains in context.

**Verification**:

```typescript
context({ action: "discard", targets: [["[tools]"]] })
// Result: "No eligible tool outputs to discard" (todowrite is protected)
// But only 1 todowrite section visible in context
```

**Result**: ✅ Only latest todo state retained

---

## Stuck Task Detection Tests

### Test 8: Stuck Task Trigger

**Purpose**: Verify stuck task warning appears after 12 turns.

**Execution**:

```typescript
// Create todo and mark in_progress
todowrite({
    todos: [
        {
            id: "stuck-test",
            content: "Task that will get stuck",
            status: "in_progress",
            priority: "high",
        },
    ],
})

// Fire 15 echo commands without updating todo
for (let i = 1; i <= 15; i++) {
    bash({ command: `echo "${i}"` })
}
```

**Expected**: At turn 12, reminder should include:

```
### ⚠️ Stuck Task Detected

I've noticed a task has been in progress for 12 turns. If you're finding it difficult to complete, consider:
- Breaking it into smaller, more specific subtasks
- Identifying blockers or dependencies that need resolution first
- Marking it as blocked and moving to another task

Use `todowrite` to split the task or update its status.
```

---

### Test 9: Extended Stuck Task Test

**Purpose**: Test stuck detection over 30+ turns.

**Execution**:

```typescript
// Same stuck task from test 8
// Fire additional 30 echo commands
for (let i = 1; i <= 30; i++) {
    bash({ command: `echo "${i}"` })
}
```

**Expected**: Stuck task warning should persist in subsequent reminders.

---

## Bug Discovery: Output Parsing

### The Bug

**Symptom**: Stuck task detection never triggered despite task being `in_progress` for 45+ turns.

**Root Cause**: `inProgressSince` timestamp was never set.

**Investigation**:

1. **Checked code** (`lib/state/tool-cache.ts:567-576`):

```typescript
// Parse todo state from result output
try {
    const content = (part.state as any).output
    const todos = JSON.parse(content) as TodoItem[] // ← BUG HERE
    if (Array.isArray(todos)) {
        latestTodos = todos
    }
} catch {
    // Ignore parse errors
}
```

2. **Identified issue**: Code assumed `part.state.output` is always a JSON string, but real OpenCode returns **object/array**.

3. **Test mock vs Reality**:

| Environment   | `part.state.output`       | `JSON.parse()` result |
| ------------- | ------------------------- | --------------------- |
| Test mock     | String: `'[{"id": "1"}]'` | ✅ Works              |
| Real OpenCode | Object: `[{id: "1"}]`     | ❌ Throws error       |

**Evidence** from `lib/commands/context.ts:141-146`:

```typescript
const outputStr =
    typeof toolPart.state.output === "string"
        ? toolPart.state.output // String case
        : JSON.stringify(toolPart.state.output) // Object case!
```

---

### The Fix

**File**: `lib/state/tool-cache.ts`

**Before (buggy)**:

```typescript
const content = (part.state as any).output
const todos = JSON.parse(content) as TodoItem[]
```

**After (fixed)**:

```typescript
const content = (part.state as any).output
let todos: TodoItem[] | null = null
if (typeof content === "string") {
    todos = JSON.parse(content) as TodoItem[]
} else if (Array.isArray(content)) {
    todos = content as TodoItem[]
}
```

**Same fix applied to** `lib/state/state.ts` (lines 311-328) for todo state restoration.

---

### Test Results After Fix

```bash
$ npm test -- tests/state/tool-cache.test.ts
✓ 36 passed (36)

$ npm test -- tests/state/state.test.ts
✓ 18 passed (18)
```

---

## Test Execution Patterns

### Pattern 1: Echo Count Sequence

Standard pattern for testing turn-based behavior:

```typescript
// Sequential echo with optional todo updates
for (let i = 1; i <= N; i++) {
    // Optional: todowrite({ todos: [...] })  // Reset reminder counter
    bash({ command: `echo "${i}"`, description: `Echo ${i}` })
}
```

**Use cases**:

- Test reminder timing (N=10, 15, 30)
- Test stuck task detection (N=15+)
- Verify auto-supersede (check context after)

---

### Pattern 2: Acknowledge and Continue

When testing for specific reminders:

```typescript
// Run echoes until reminder appears
for (let i = 1; i <= 30; i++) {
    bash({ command: `echo "${i}"` })
    // If reminder appears: acknowledge and continue
}

// Response: "got it" → continue
```

---

### Pattern 3: Context Verification

After operations, verify context state:

```typescript
// Check how many tool outputs exist
context({ action: "discard", targets: [["[tools]"]] })
// Result: "No eligible tool outputs to discard" = all pruned/superseded

// Check how many todowrite sections exist
// Should only see ONE (latest) due to supersede
```

---

### Pattern 4: Canary Tasks

Always include identifiable markers:

```typescript
todowrite({
    todos: [
        {
            id: "test-name",
            content: "TEST: Description of what we're testing",
            status: "in_progress",
            priority: "high",
        },
    ],
})
```

**Naming convention**:

- Use `test-` prefix for test todos
- Include description of test purpose
- Set `priority: "high"` for visibility

---

## Summary

| Test                   | Purpose                   | Result   |
| ---------------------- | ------------------------- | -------- |
| Discard thinking       | Context pruning           | ✅ Works |
| Discard messages       | Assistant message pruning | ✅ Works |
| Discard tools          | Tool output pruning       | ✅ Works |
| Reminder timing        | 8/4 turn intervals        | ✅ Works |
| Reminder dedup         | One-at-a-time             | ✅ Works |
| Sequential echo + todo | Suppression on update     | ✅ Works |
| Todo supersede         | One-todo-one-view         | ✅ Works |
| Stuck detection        | 12-turn threshold         | 🐛 Fixed |
| Output parsing         | String vs Object          | ✅ Fixed |

**Files Modified**:

- `lib/state/tool-cache.ts` — Fixed output parsing for `inProgressSince`
- `lib/state/state.ts` — Fixed output parsing for todo restoration
- `README.md` — Updated documentation with correct defaults

---

## Related Documentation

- [Validation Guide](VALIDATION_GUIDE.md) — 43 comprehensive test cases
- [Test Harness](TEST_HARNESS.md) — Ready-to-run test scripts
- [README](../README.md) — Configuration and usage

---

_Last updated: After stuck task detection bug fix_
