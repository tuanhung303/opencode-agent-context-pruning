# ACP Validation Guide v2.0

## Agentic Context Pruning - Practical Test Suite

**Objective**: Validate all 43 tests with simulated thinking patterns and practical execution steps.

---

## 🚀 Quick Start (Copy-Paste Ready)

### Step 1: Initialize Test Environment

```typescript
// Run this first - creates test infrastructure
write({
    filePath: "/Users/_blitzzz/Documents/GitHub/opencode-agent-context-pruning/test-file.txt",
    content: "Initial test content for file operations",
})

write({
    filePath: "/Users/_blitzzz/Documents/GitHub/opencode-agent-context-pruning/other-file.txt",
    content: "Secondary test file for cross-file testing",
})
```

### Step 2: Load Test Todos

Copy the **Executable Todo List** (bottom of doc) into `todowrite()`.

### Step 3: Execute Test Pattern

Each test follows this pattern:

1. **Generate** content (tool call, message, or thinking)
2. **Capture** the hash from output
3. **Prune** using `context()` tool
4. **Verify** the result

---

## 🧠 Simulated Thinking Patterns

### Pattern A: Fake Thinking Block Generator

Use this technique to create thinking blocks that can be pruned:

```typescript
// Method 1: Extended analysis simulation
const analysis = `
Analyzing codebase structure...
- Found 15 TypeScript files
- Identified 3 core modules
- Detected 2 potential optimizations
This is simulated reasoning content that will generate a thinking hash.
`

// Method 2: Multi-step reasoning
const reasoning = `
Step 1: Evaluating current context size
Step 2: Identifying pruneable content
Step 3: Calculating token savings
Conclusion: Can prune approximately 2,400 tokens
`
```

### Pattern B: Thinking Block with Explicit Hash

When you see output like this in your response:

```
<thinking>
Analyzing requirements...
<reasoning_hash>abc123</reasoning_hash>
</thinking>
```

You can prune it:

```typescript
context({
    action: "discard",
    targets: [["abc123"]],
})
```

### Pattern C: Batch Thinking Prune

```typescript
// Prune multiple thinking blocks by hash
context({
    action: "discard",
    targets: [["abc123"], ["def456"]],
})
```

---

## 📋 Test Execution Guide

### Category 1: Core Context Operations (t1-t12)

#### ✅ Test 1: Basic Discard - Tool Hash

**Execution**:

```typescript
// 1. Generate tool output
read({ filePath: "package.json" })
// → Note the hash (e.g., 44136f) from output

// 2. Discard it
context({
    action: "discard",
    targets: [["44136f"]], // Replace with actual hash
})

// 3. Verify: Should see "pruned: read" in output
```

**Success Criteria**: Tool output removed from context

---

#### ✅ Test 2: Basic Discard - Message Hash

**Execution**:

```typescript
// 1. Create a message that will have a hash
write({
    filePath: "temp.txt",
    content: "Test message for hash generation",
})
// → Assistant response will have message_hash

// 2. Discard the message part
context({
    action: "discard",
    targets: [["msg_abc123"]], // Replace with actual hash
})
```

---

#### ✅ Test 3: Mixed Discard - Tool + Message

**Execution**:

```typescript
// Generate both types
read({ filePath: "package.json" })
write({ filePath: "test.txt", content: "test" })

// Prune both (use actual hashes)
context({
    action: "discard",
    targets: [
        ["44136f"], // Tool hash
        ["msg_abc123"], // Message hash
    ],
})
```

---

#### ✅ Test 4: Distill Tool Output

**Execution**:

```typescript
// 1. Generate content to distill
glob({ pattern: "*.ts" })
// → Hash: 01cb91 (example)

// 2. Distill with summary
context({
    action: "distill",
    targets: [["01cb91", "Found 8 TypeScript files"]],
})

// 3. Verify: Should see "distilled: Foun...iles" in output
```

---

#### ✅ Test 5: Distill Message Hash

**Execution**:

```typescript
// 1. Generate message
bash({ command: "echo 'test'" })

// 2. Distill message (use actual hash)
context({
    action: "distill",
    targets: [["msg_def456", "Test command executed"]],
})
```

---

#### ✅ Test 6: Mixed Distill

**Execution**:

```typescript
// Generate tool and message
read({ filePath: "README.md" })
bash({ command: "ls" })

// Distill both with summaries
context({
    action: "distill",
    targets: [
        ["hash1", "README contains project docs"],
        ["hash2", "Directory listing obtained"],
    ],
})
```

---

#### ✅ Test 11: Protected Tools Exclusion

**Pre-check** (verify config):

```typescript
read({ filePath: "lib/config/defaults.ts" })
// Verify: 'task' is in DEFAULT_PROTECTED_TOOLS array
```

**Execution**:

```typescript
// Generate a protected tool output
todowrite({ todos: [...] }) // Hash: todo123

// Attempt to discard it directly
context({ action: "discard", targets: [["todo123"]] })

// Verify: todowrite remains (protected tools cannot be discarded)
```

---

#### ✅ Test 12: Graceful Error Handling

**Execution**:

```typescript
// Test 12a: Invalid hash
try {
    context({ action: "discard", targets: [["invalid_hash"]] })
} catch (e) {
    // Should gracefully handle, not crash
}

// Test 12b: Non-existent hash
context({ action: "discard", targets: [["zzzzzz"]] })
// Expected: "No eligible tool outputs to discard"

// Test 12c: Distill without summary (should fail gracefully)
context({ action: "distill", targets: [["abc123"]] })
// Expected: Error or graceful skip (distill requires summary)
```

---

### Category 2: Auto-Supersede (t13-t20)

#### ✅ Test 13: Hash-Based Supersede

**Execution**:

```typescript
// Turn 1: First read
read({ filePath: "package.json" })
// → Hash: 825138

// Do some work (turn 2)
bash({ command: "echo 'working'" })

// Turn 3: Same read again
read({ filePath: "package.json" })
// → Hash: 44136f (different hash, same content)

// Verify: First read (825138) auto-superseded
// Check stats: Should show "🔄 hash: 1"
```

---

#### ✅ Test 14: File-Based Supersede (Write)

**Execution**:

```typescript
// Turn 1: Read file
read({ filePath: "test-file.txt" })

// Turn 2: Write to same file
write({
    filePath: "test-file.txt",
    content: "New content superseding read",
})

// Verify: Read is superseded by write
// Stats: "📁 file: 1"
```

---

#### ✅ Test 15: File-Based Supersede (Edit)

**Execution**:

```typescript
// Setup: Ensure file exists
read({ filePath: "test-file.txt" })

// Edit the file
edit({
    filePath: "test-file.txt",
    oldString: "New content superseding read",
    newString: "Edited content",
})

// Verify: Previous file operations superseded
```

---

#### ✅ Test 16: Todo-Based Supersede (todowrite)

**Execution**:

```typescript
// First todowrite
todowrite({
    todos: [{ id: "1", content: "Initial task", status: "pending" }],
})

// Do work
bash({ command: "echo 'working'" })

// Second todowrite (supersedes first)
todowrite({
    todos: [{ id: "1", content: "Updated task", status: "in_progress" }],
})

// Verify: Only latest todo state exists
// Stats: "✅ todo: 1"
```

---

#### ✅ Test 17: Todo-Based Supersede (todoread)

**Execution**:

```typescript
// First read
todoread()

// Do work
read({ filePath: "package.json" })

// Second read (supersedes first)
todoread()

// Verify: First todoread superseded
```

---

#### ✅ Test 18: No Supersede for Different Files

**Execution**:

```typescript
// Read different files
read({ filePath: "package.json" }) // File A
read({ filePath: "other-file.txt" }) // File B

// Verify: Both reads remain (no cross-supersede)
// Check context: Both tool outputs present
```

---

#### ✅ Test 19: No Supersede for Protected Tools

**Execution**:

```typescript
// Call protected tool twice
todowrite({ todos: [{ id: "1", content: "First", status: "pending" }] })
todowrite({ todos: [{ id: "1", content: "Second", status: "in_progress" }] })

// For 'task' tool specifically:
// task({ description: "Task 1", prompt: "..." })
// task({ description: "Task 2", prompt: "..." })

// Verify: Both calls persist (no supersede for protected tools)
```

---

#### ✅ Test 20: Combined Auto-Supersede Stats

**Execution**:

```typescript
// Trigger all three supersede types:

// 1. Hash-based: Same read twice
read({ filePath: "package.json" })
read({ filePath: "package.json" })

// 2. File-based: Read then write
read({ filePath: "test-file.txt" })
write({ filePath: "test-file.txt", content: "final" })

// 3. Todo-based: Two todowrites
todowrite({ todos: [{ id: "t1", content: "A", status: "pending" }] })
todowrite({ todos: [{ id: "t1", content: "B", status: "in_progress" }] })

// Check stats - should show breakdown by type
```

---

### Category 3: Stuck Task Detection (t21-t25)

**⚠️ Requires**: `stuckTaskTurns: 12` in config

#### ✅ Test 21: Stuck Task Detection - Basic

**Simulation Pattern** (avoids 12-turn wait):

```typescript
// Create task at turn 0
todowrite({
    todos: [
        {
            id: "stuck-test",
            content: "This task will appear stuck",
            status: "in_progress",
        },
    ],
})

// Simulate 12 turns of work:
for (let i = 1; i <= 12; i++) {
    bash({ command: `echo "Turn ${i}"` })
    // Or any lightweight operation
}

// Verify: Todo reminder should show stuck task warning
// "⚠️ Task Breakdown Suggestion"
```

**Code Verification** (if simulation not possible):

```typescript
read({ filePath: "lib/messages/todo-reminder.ts" })
// Verify lines 141-160 contain stuck task detection logic
// Formula: currentTurn - inProgressSince >= stuckTaskTurns
```

---

#### ✅ Test 22: Timestamp Preservation

**Execution**:

```typescript
// Create task and mark in_progress
todowrite({
    todos: [
        {
            id: "timestamp-test",
            content: "Original content",
            status: "in_progress",
            inProgressSince: 5, // Simulated turn 5
        },
    ],
})

// Update content (keep status)
todowrite({
    todos: [
        {
            id: "timestamp-test",
            content: "Updated content", // Changed
            status: "in_progress", // Same
            inProgressSince: 5, // Should preserve original
        },
    ],
})

// Verify: inProgressSince remains 5 (not reset to current turn)
```

---

#### ✅ Test 23: New Task Transition

**Execution**:

```typescript
// Turn 0: Create as pending
todowrite({
    todos: [
        {
            id: "transition-test",
            content: "Task",
            status: "pending",
        },
    ],
})

// Simulate 5 turns of work
for (let i = 1; i <= 5; i++) {
    bash({ command: `echo "Work ${i}"` })
}

// Turn 6: Transition to in_progress
todowrite({
    todos: [
        {
            id: "transition-test",
            content: "Task",
            status: "in_progress",
            // inProgressSince should be set to 6
        },
    ],
})

// Verify: Stuck detection calculates from turn 6, not turn 0
```

---

#### ✅ Test 24: Multiple Stuck Tasks

**Execution**:

```typescript
// Create multiple stuck tasks
todowrite({
    todos: [
        {
            id: "stuck-1",
            content: "Stuck for 15 turns",
            status: "in_progress",
            inProgressSince: 0, // Current turn is 15
        },
        {
            id: "stuck-2",
            content: "Stuck for 8 turns",
            status: "in_progress",
            inProgressSince: 7, // Current turn is 15
        },
    ],
})

// Simulate to turn 15
for (let i = 1; i <= 15; i++) {
    bash({ command: "echo '.'" })
}

// Verify: Reminder should highlight stuck-1 (15 turns) over stuck-2 (8 turns)
```

---

#### ✅ Test 25: Completed Task Clears

**Execution**:

```typescript
// Create task, let it sit, then complete
todowrite({
    todos: [
        {
            id: "complete-test",
            content: "Will complete before stuck",
            status: "in_progress",
        },
    ],
})

// Do 10 turns of work (below 12-turn threshold)
for (let i = 1; i <= 10; i++) {
    bash({ command: "echo '.'" })
}

// Complete the task
todowrite({
    todos: [
        {
            id: "complete-test",
            content: "Will complete before stuck",
            status: "completed",
        },
    ],
})

// Do 5 more turns
for (let i = 11; i <= 15; i++) {
    bash({ command: "echo '.'" })
}

// Verify: No stuck task warning for completed task
```

---

### Category 4: Reminder Deduplication (t26-t28)

#### ✅ Test 26: Todo Reminder Deduplication

**Execution**:

```typescript
// Trigger multiple todo reminders by updating todos repeatedly
todowrite({ todos: [{ id: "1", content: "A", status: "pending" }] })
todowrite({ todos: [{ id: "1", content: "B", status: "pending" }] })
todowrite({ todos: [{ id: "1", content: "C", status: "pending" }] })

// Verify: Only ONE todo reminder message exists in context
// Previous reminders auto-superseded
```

---

#### ✅ Test 27: Automata Reflection Deduplication

**Note**: Automata reflection is triggered by specific agent modes.

**Execution**:

```typescript
// If in automata mode, trigger reflections
// (This is mode-dependent)

// Verify: Only ONE reflection exists at a time
// Check context for reflection messages
```

---

#### ✅ Test 28: Mixed Reminders Coexistence

**Execution**:

```typescript
// Trigger todo reminder
todowrite({ todos: [{ id: "1", content: "Task", status: "pending" }] })

// Trigger automata reflection (if in automata mode)
// This happens automatically in automata mode

// Verify: Both types can coexist
// - One todo reminder
// - One automata reflection
```

---

### Category 5: Thinking Block & Message Pruning (t29-t32)

#### ✅ Test 29: Pruning Thinking Blocks

**Execution** (requires extended thinking or simulation):

**Method A** - Natural thinking:

```typescript
// Perform complex analysis (triggers thinking block)
read({ filePath: "lib/strategies/distill.ts" })
// Analyze and document findings...

// Look for reasoning_hash in output, then prune:
context({
    action: "discard",
    targets: [["abc123"]], // Replace with actual hash
})
```

**Verify**: Thinking blocks removed from context

---

#### ✅ Test 30: Pruning Assistant Messages

**Execution**:

```typescript
// Generate assistant message
write({ filePath: "test.txt", content: "test" })
// → Assistant responds with message_hash

// Prune the message
context({
    action: "discard",
    targets: [["msg_abc123"]], // Replace with actual hash
})

// Verify: Message shows "[Assistant message part removed to save context]"
```

---

#### ✅ Test 31: Distill Thinking Block

**Execution**:

```typescript
// Generate thinking block (complex analysis)
// Look for reasoning_hash

// Distill with summary
context({
    action: "distill",
    targets: [["abc123", "Analysis: 3 optimization opportunities found"]],
})

// Verify: Thinking block replaced with summary
```

---

### Category 6: Aggressive Pruning (t33-t43)

#### ✅ Test 33: Input Leak Fix

**Execution**:

```typescript
// Write large content
write({
    filePath: "large-file.txt",
    content: "A".repeat(10000), // 10KB of content
})

// Supersede with new write
write({
    filePath: "large-file.txt",
    content: "Small content",
})

// Verify: First write's input content masked
// Should show metadata only, not full 10KB content
```

---

#### ✅ Test 34: One-File-One-View Policy

**Pre-check**: Verify `aggressiveFilePrune: true`

**Execution**:

```typescript
// Multiple operations on same file
read({ filePath: "package.json" })
read({ filePath: "package.json" })
write({ filePath: "package.json", content: "{}" })
edit({ filePath: "package.json", oldString: "{}", newString: '{"x":1}' })

// Verify: Each operation superseded previous ones
// Only latest operation on package.json remains
```

---

#### ✅ Test 35: Step Marker Filtering

**Pre-check**: Verify `pruneStepMarkers: true`

**Execution**:

```typescript
// Execute multi-step operation
// Step markers are internal and auto-filtered

// Verify: No "step-start" or "step-finish" parts in context
// (This is automatic, just confirm config is set)
read({ filePath: "lib/config/defaults.ts" })
// Check that pruneStepMarkers is in default config
```

---

#### ✅ Test 36: Source-URL Supersede

**Execution**:

```typescript
// Fetch same URL twice
webfetch({ url: "https://example.com" })
webfetch({ url: "https://example.com" })

// Verify: First fetch superseded by second
// Stats: "🔗 url: 1"
```

---

#### ✅ Test 37: State Query Supersede

**Execution**:

```typescript
// Run same state query twice
bash({ command: "ls -la" })
bash({ command: "ls -la" })

// Verify: First query superseded
// Stats: "📊 query: 1"
```

---

#### ✅ Test 38: Snapshot Auto-Supersede

**Note**: Snapshots are internal state captures.

**Execution**:

```typescript
// Snapshots auto-generated during operations
// Trigger multiple operations
read({ filePath: "package.json" })
glob({ pattern: "*.ts" })
write({ filePath: "test.txt", content: "x" })

// Verify: Only latest snapshot retained
// (Internal behavior, verify via code inspection if needed)
```

---

#### ✅ Test 39: Retry Auto-Prune

**Execution**:

```typescript
// Trigger a failing operation
bash({ command: "invalid_command_12345" })
// → Should fail

// Retry with correction
bash({ command: "echo 'success'" })
// → Should succeed

// Verify: Failed attempt auto-pruned
// Only successful retry remains in context
```

---

#### ✅ Test 40: File Part Masking

**Pre-check**: Verify `pruneFiles: true`

**Execution**:

```typescript
// Attach file (if supported by environment)
// File attachments should be masked

// Verify: File attachments replaced with breadcrumbs
// e.g., "[File: document.pdf - 156KB]"
```

---

#### ✅ Test 41: Compaction Awareness

**Execution**:

```typescript
// Content with time.compacted field
// (Internal metadata)

// Verify: Already-compacted content not double-processed
// This is internal optimization

// Check via code inspection:
read({ filePath: "lib/strategies/compaction.ts" })
```

---

## 🎯 Quick Validation Scripts

### Script 1: Core Operations Smoke Test

```typescript
// Run this to validate basic functionality
async function smokeTest() {
    // Generate
    const r1 = await read({ filePath: "package.json" })
    const r2 = await glob({ pattern: "*.json" })

    // Capture hashes from output
    const hash1 = "44136f" // Replace with actual
    const hash2 = "01cb91" // Replace with actual

    // Prune
    await context({ action: "discard", targets: [[hash1], [hash2]] })

    return "Smoke test complete"
}
```

### Script 2: Supersede Verification

```typescript
// Verify all supersede types
async function supersedeTest() {
    // Hash-based
    await read({ filePath: "package.json" })
    await read({ filePath: "package.json" })

    // File-based
    await read({ filePath: "test-file.txt" })
    await write({ filePath: "test-file.txt", content: "x" })

    // Todo-based
    await todowrite({ todos: [{ id: "1", content: "A" }] })
    await todowrite({ todos: [{ id: "1", content: "B" }] })

    return "Supersede test complete"
}
```

---

## 📝 Executable Todo List

Copy this ENTIRE JSON array into `todowrite()`:

```json
[
    {
        "id": "prep-0",
        "content": "PREP: Run npx tsc --noEmit, document any errors",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "prep-1",
        "content": "PREP: Create test-file.txt and other-file.txt",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "prep-2",
        "content": "PREP: Verify config - aggressiveFilePrune, pruneStepMarkers, stuckTaskTurns",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "prep-3",
        "content": "PREP: Read package.json to verify file access",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "prep-4",
        "content": "PREP: Check protectedTools includes 'task' in defaults.ts",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "prep-5",
        "content": "PREP: Create docs/test_trail.md for logging",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t1",
        "content": "TEST: Basic Discard - Tool Hash (read package.json, capture hash, discard)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t2",
        "content": "TEST: Basic Discard - Message Hash (generate message, capture hash, discard)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t3",
        "content": "TEST: Mixed Discard - Tool + Message Hash (both types in one call)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t4",
        "content": "TEST: Distill Tool Output (glob *.ts, distill with summary)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t5",
        "content": "TEST: Distill Message Hash (create message, distill with summary)",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t11",
        "content": "TEST: Protected Tools Exclusion (try to discard protected tool, verify it remains)",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t12",
        "content": "TEST: Graceful Error Handling (invalid hash, missing summary)",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t13",
        "content": "TEST: Hash-Based Supersede (same read twice, verify first superseded)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t14",
        "content": "TEST: File-Based Supersede Write (read then write same file)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t15",
        "content": "TEST: File-Based Supersede Edit (read then edit same file)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t16",
        "content": "TEST: Todo-Based Supersede todowrite (two todowrites, first superseded)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t17",
        "content": "TEST: Todo-Based Supersede todoread (two todoreads, first superseded)",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t18",
        "content": "TEST: No Supersede Different Files (read file A and B, both persist)",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t19",
        "content": "TEST: No Supersede Protected Tools (call todowrite twice, both persist)",
        "status": "pending",
        "priority": "low"
    },
    {
        "id": "t20",
        "content": "TEST: Combined Auto-Supersede Stats (trigger all 3 types, check stats)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t21",
        "content": "TEST: Stuck Task Detection Basic (create in_progress task, simulate 12 turns)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t22",
        "content": "TEST: Stuck Task Timestamp Preservation (update content, verify timestamp kept)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t23",
        "content": "TEST: Stuck Task New Task Transition (pending→in_progress at turn 6, check calc)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t24",
        "content": "TEST: Stuck Task Multiple Tasks (2 stuck tasks, verify longest highlighted)",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t25",
        "content": "TEST: Stuck Task Completed Clears (complete before threshold, no warning)",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t26",
        "content": "TEST: Todo Reminder Deduplication (3 todo updates, only 1 reminder)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t27",
        "content": "TEST: Automata Reflection Deduplication (verify single reflection)",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t28",
        "content": "TEST: Mixed Reminders Coexistence (todo + automata can coexist)",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t29",
        "content": "TEST: Pruning Thinking Blocks (generate thinking, capture hash, discard)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t30",
        "content": "TEST: Pruning Assistant Messages (generate message, capture hash, discard)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t31",
        "content": "TEST: Distill Thinking Block (thinking with summary)",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t33",
        "content": "TEST: Input Leak Fix (write large file, supersede, verify masked)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t34",
        "content": "TEST: One-File-One-View Policy (multiple ops on same file, only latest)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t35",
        "content": "TEST: Step Marker Filtering (verify no step markers in context)",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t36",
        "content": "TEST: Source-URL Supersede (webfetch same URL twice, first superseded)",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t37",
        "content": "TEST: State Query Supersede (same bash command twice, first superseded)",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t38",
        "content": "TEST: Snapshot Auto-Supersede (verify only latest snapshot)",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t39",
        "content": "TEST: Retry Auto-Prune (fail then succeed, failed attempt removed)",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t40",
        "content": "TEST: File Part Masking (verify file attachments masked)",
        "status": "pending",
        "priority": "medium"
    },

    {
        "id": "t41",
        "content": "TEST: Compaction Awareness (verify no double-processing)",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "report-1",
        "content": "POST: Generate summary report with pass/fail counts",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "report-2",
        "content": "POST: Verify all checklists complete",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "report-3",
        "content": "POST: Document skipped tests with reasons",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "report-4",
        "content": "POST: Create re-evaluation guide for future sessions",
        "status": "pending",
        "priority": "medium"
    }
]
```

---

## ✅ Validation Checklists

### Pre-Flight Checklist

- [ ] TypeScript compiles without errors (`npx tsc --noEmit`)
- [ ] Test files created (`test-file.txt`, `other-file.txt`)
- [ ] Config verified (`aggressiveFilePrune=true`, `pruneStepMarkers=true`, `stuckTaskTurns=12`)
- [ ] Protected tools include: `task`, `todowrite`, `todoread`, `write`, `edit`, `context`
- [ ] Todo list loaded into `todowrite()`

### Core Operations Checklist

- [ ] Tool hash format: 6 hex characters (e.g., `44136f`)
- [ ] Message hash accessible via `hashToMessagePart`
- [ ] Thinking hash accessible via `hashToReasoningPart`
- [ ] Discard adds to `prune.toolIds` and `prune.messagePartIds`
- [ ] Distill stores summaries in `softPrunedTools`
- [ ] Protected tools cannot be discarded

### Supersede Checklist

- [ ] Hash-based: Duplicate operations auto-supersede
- [ ] File-based: Read→Write→Edit chain works
- [ ] Todo-based: todowrite/todoread auto-supersede
- [ ] Cross-file protection: Different files don't supersede
- [ ] Protected tool protection: `task`, `todowrite`, etc. never supersede

### Stuck Task Checklist

- [ ] Threshold: 12 turns (config `stuckTaskTurns`)
- [ ] Formula: `currentTurn - inProgressSince >= 12`
- [ ] Timestamp preservation on content updates
- [ ] Transition tracking: `pending→in_progress` sets timestamp
- [ ] Completed tasks excluded from stuck detection

### Aggressive Pruning Checklist

- [ ] Input leak fixed: Superseded tool inputs stripped
- [ ] One-file-one-view: Only latest file operation retained
- [ ] Step markers filtered: No `step-start`/`step-finish` in context
- [ ] URL supersede: Same URL fetches deduplicated
- [ ] State query supersede: Same queries deduplicated
- [ ] Error truncation: Old errors truncated to first line

---

## 🎓 Pro Tips

1. **Hash Capture**: Always note tool hashes immediately after execution
2. **Batch Pruning**: Use lists of hashes `[["h1"], ["h2"]]` for quick cleanup
3. **Protected Awareness**: Remember `task`, `todowrite`, `write`, `edit` are protected
4. **Simulate Turns**: Use loops to simulate passage of time
5. **Code Inspection**: When runtime test not possible, read source code
6. **Todo Tracking**: Keep todo list updated as you progress

---

## ⚠️ Test Output Rules

**DO NOT create separate test report files.** Test artifacts are gitignored:

```gitignore
# These are excluded from version control
docs/test_trail.md
docs/test_report_*.md
```

**When running validation tests:**

- Report results directly in conversation (not in files)
- Clean up test files (`test-file.txt`, `other-file.txt`, `large-test.txt`) after completion
- Do NOT commit test trails or reports

---

**End of Validation Guide v2.0**
