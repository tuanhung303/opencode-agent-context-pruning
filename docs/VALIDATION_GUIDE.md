# ACP Validation Guide v3.0

## Agentic Context Pruning — Feature Validation Suite

**Objective**: Validate all ACP features through automated tests AND manual interactive testing.

---

## ⚠️ MANDATORY: Dual-Test Protocol

> **Agents reading this guide**: You MUST execute BOTH test phases. Static tests alone are insufficient — manual tests verify runtime behavior that unit tests cannot cover (actual hash generation, real context mutation, status bar output, provider compatibility).

### Phase 1: Automated Tests (MUST PASS before Phase 2)

```bash
# 1. Type check
npx tsc --noEmit

# 2. Run full unit test suite
npm run test

# 3. Run E2E tests specifically
npm test -- tests/e2e/

# 4. Build the plugin
npm run build
```

**Gate**: ALL automated tests must pass. If any fail, fix them before proceeding to Phase 2.

### Phase 2: Manual Interactive Tests

Execute each test scenario below **one by one** inside a live `opencode` session with ACP loaded. These tests validate real runtime behavior:

- Actual hash generation and capture
- Real context mutation visible in `/acp stats`
- Status bar feedback
- Provider-specific thinking mode safety
- Cross-turn supersede timing

**Test Pattern** (every manual test follows this):

1. **Setup** — Create preconditions
2. **Execute** — Perform the action
3. **Verify** — Check the result with specific PASS/FAIL criteria
4. **Record** — Mark pass/fail in the todo list

---

## 📋 Test Scenarios

### Category 1: Core Context Operations (m1-m12)

These test the `context_prune` tool — the agent's manual interface for context management.

---

#### m1: Discard — Tool Output

**What it validates**: Agent can remove a tool output by its 6-char hex hash.

**Execute**:

```typescript
// 1. Generate a tool output
read({ filePath: "package.json" })
// → Note the <tool_hash>XXXXXX</tool_hash> in output

// 2. Discard it
context_prune({ action: "discard", targets: [["XXXXXX"]] })
```

**PASS**: Response contains `discard ✓` and tool output no longer in context.
**FAIL**: Error thrown, or tool output still visible after prune.

---

#### m2: Discard — Assistant Message Part

**What it validates**: Agent can remove its own message parts by hash.

**Prereq**: `enableAssistantMessagePruning: true` (default)

**Execute**:

```typescript
// 1. Generate assistant response (creates message hash)
write({ filePath: "test.txt", content: "test" })
// → Note the message hash in assistant output

// 2. Discard the message
context_prune({ action: "discard", targets: [["XXXXXX"]] })
```

**PASS**: Message part replaced with `[Assistant message part removed to save context]`.
**FAIL**: Hash not found, or message part unchanged.

---

#### m3: Discard — Reasoning/Thinking Block (Thinking Mode Safety)

**What it validates**: ACP auto-converts discard→distill for reasoning to preserve `reasoning_content` field (provider safety for Anthropic/DeepSeek/Kimi).

**Prereq**: Extended thinking mode enabled, `enableReasoningPruning: true`

**Execute**:

```typescript
// 1. Trigger complex analysis (generates thinking block)
// Look for <thinking>...</thinking> in response

// 2. Try to discard thinking block
context_prune({ action: "discard", targets: [["abc123"]] })
```

**PASS**: Thinking block replaced with minimal placeholder `—` (NOT fully removed). Response shows `distill ✓` instead of `discard ✓`.
**FAIL**: Thinking block fully removed (will cause 400 errors on next API call), or unchanged.

---

#### m4: Discard — Mixed Batch (Tool + Message + Reasoning)

**What it validates**: Single `context_prune` call handles multiple target types.

**Execute**:

```typescript
// Generate all three types, capture hashes
// Then batch discard:
context_prune({
    action: "discard",
    targets: [
        ["tool_hash"], // from a tool call
        ["msg_hash"], // from assistant message
        ["thinking_hash"], // from reasoning block
    ],
})
```

**PASS**: All three targets processed. Stats show counts incremented for each type.
**FAIL**: Any target type silently skipped or error thrown.

---

#### m5: Distill — Tool Output with Summary

**What it validates**: Tool output replaced with concise summary instead of full removal.

**Execute**:

```typescript
// 1. Generate content to distill
glob({ pattern: "**/*.ts" })
// → Note hash

// 2. Distill with summary
context_prune({
    action: "distill",
    targets: [["XXXXXX", "Found 47 TypeScript files across 8 directories"]],
})
```

**PASS**: Response shows `distill ✓`. Original output replaced with summary text.
**FAIL**: Summary not stored, or original output still visible.

---

#### m6: Distill — Message Part with Summary

**What it validates**: Assistant message parts can be distilled.

**Execute**:

```typescript
// 1. Generate verbose assistant response
// 2. Distill the message
context_prune({
    action: "distill",
    targets: [["XXXXXX", "Analysis: chose JWT over sessions"]],
})
```

**PASS**: Message part replaced with summary.
**FAIL**: Message unchanged or removed without summary.

---

#### m7: Distill — Reasoning Block with Summary

**What it validates**: Thinking blocks can be distilled while preserving API compatibility.

**Execute**:

```typescript
// 1. Generate thinking block via complex analysis
// 2. Distill with summary
context_prune({
    action: "distill",
    targets: [["XXXXXX", "Chose JWT: stateless, scalable. Rejected sessions."]],
})
```

**PASS**: Thinking block replaced with summary, `reasoning_content` field preserved.
**FAIL**: 400 error on next API call (missing reasoning_content).

---

#### m8: Replace — Pattern-Based Content Editing

**What it validates**: Precise content replacement using start/end patterns.

**Execute**:

```typescript
// After generating content with clear markers:
context_prune({
    action: "replace",
    targets: [["Start of analysis:", "End of analysis.", "[Analysis distilled to summary]"]],
})
```

**PASS**: Content between markers replaced exactly once.
**FAIL**: No replacement, multiple replacements, or overlapping patterns error.

**Constraints** (must be validated):

- Match content must be ≥30 characters
- Start OR end pattern must be >15 characters
- No regex — literal matching only
- No overlapping patterns allowed

---

#### m9: Protected Tools — Cannot Discard

**What it validates**: Protected tools cannot be pruned.

**Default Protected Tools**: `context_info`, `task`, `todowrite`, `todoread`, `context_prune`, `batch`, `write`, `edit`, `plan_enter`, `plan_exit`

**Execute**:

```typescript
// Try to discard a protected tool
todowrite({ todos: [{ id: "1", content: "Test", status: "pending" }] })
// Capture hash, then try:
context_prune({ action: "discard", targets: [["XXXXXX"]] })
```

**PASS**: Error thrown with "protected" message. Tool output remains.
**FAIL**: Protected tool was incorrectly pruned.

---

#### m10: Protected Tools — Configurable List

**What it validates**: Custom tools can be added to protected list via config.

**Pre-check** (config file):

```json
{
    "tools": {
        "settings": {
            "protectedTools": ["my_critical_tool"]
        }
    }
}
```

**Execute**: Try to discard `my_critical_tool` by hash.

**PASS**: Custom tool is protected and cannot be discarded.
**FAIL**: Custom tool was pruned despite config.

---

#### m11: Hash Format Validation

**What it validates**: Only valid 6-char hex hashes accepted.

**Execute**:

```typescript
// Invalid formats to test:
context_prune({ action: "discard", targets: [["abc"]] }) // Wrong length
context_prune({ action: "discard", targets: [["zzzzzz"]] }) // Invalid hex
context_prune({ action: "discard", targets: [["ABC123"]] }) // Uppercase (rejected)
context_prune({ action: "discard", targets: [["abc123"]] }) // Valid lowercase
```

**PASS**: Invalid formats throw "Invalid hash format". Valid lowercase accepted.
**FAIL**: Invalid hashes accepted, or valid hashes rejected.

---

#### m12: Error Handling — Graceful Degradation

**What it validates**: Non-existent hashes and edge cases handled gracefully.

**Execute**:

```typescript
// Non-existent hash (valid format, not in context)
context_prune({ action: "discard", targets: [["a1b2c3"]] })
// → Should return "No eligible tool outputs to discard" (not crash)

// Empty targets array
context_prune({ action: "discard", targets: [] })
// → Should throw "No targets provided"

// Distill without summary
context_prune({ action: "distill", targets: [["abc123"]] })
// → Should throw "Summary required"
```

**PASS**: Graceful error messages, no crashes.
**FAIL**: Crashes, hangs, or cryptic error messages.

---

### Category 2: Auto-Supersede Mechanisms (m13-m22)

These test automatic context deduplication — no manual `context_prune` calls needed.

---

#### m13: Hash-Based Supersede (Duplicate Tool Calls)

**What it validates**: Identical tool calls automatically supersede previous ones.

**Execute**:

```typescript
// Turn 1: First read
read({ filePath: "package.json" })

// ... some work (turns 2-5) ...

// Turn 6: Same read again
read({ filePath: "package.json" })

// Check /acp stats — should show "🔄 hash: 1"
```

**PASS**: First read auto-superseded. Stats show hash supersede count.
**FAIL**: Both reads remain in context.

---

#### m14: File-Based Supersede — Write Supersedes Read

**What it validates**: Write to a file supersedes all previous operations on that file.

**Execute**:

```typescript
read({ filePath: "test.txt" }) // Turn 1
write({ filePath: "test.txt", content: "new" }) // Turn 3
// Check stats: should show "📁 file: 1"
```

**PASS**: Read auto-superseded by write. Only write remains.
**FAIL**: Both read and write in context.

---

#### m15: File-Based Supersede — Edit Supersedes Previous Operations

**What it validates**: Edit supersedes reads AND writes on same file.

**Execute**:

```typescript
read({ filePath: "test.txt" }) // Turn 1
write({ filePath: "test.txt", content: "initial" }) // Turn 2
edit({ filePath: "test.txt", oldString: "initial", newString: "edited" }) // Turn 3
```

**PASS**: Both read and write superseded. Only edit remains.
**FAIL**: Multiple operations on same file visible.

---

#### m16: Todo-Based Supersede — todowrite

**What it validates**: New todowrite supersedes previous todo states.

**Execute**:

```typescript
todowrite({ todos: [{ id: "1", content: "A", status: "pending" }] }) // Turn 1
todowrite({ todos: [{ id: "1", content: "A", status: "in_progress" }] }) // Turn 2
// Check stats: should show "✅ todo: 1"
```

**PASS**: First todowrite superseded. Only latest state remains.
**FAIL**: Multiple todo states in context.

---

#### m17: Todo-Based Supersede — todoread

**What it validates**: New todoread supersedes previous todoread calls.

**Execute**:

```typescript
todoread() // Turn 1
// ... work ...
todoread() // Turn 5
```

**PASS**: First todoread superseded. Only latest remains.
**FAIL**: Multiple todoread calls in context.

---

#### m18: URL-Based Supersede (webfetch)

**What it validates**: Same URL fetches are deduplicated.

**Prereq**: `pruneSourceUrls: true` (default)

**Execute**:

```typescript
webfetch({ url: "https://example.com/docs" }) // Turn 1
// ... work ...
webfetch({ url: "https://example.com/docs" }) // Turn 5
// Check stats: should show "🔗 url: 1"
```

**PASS**: First fetch superseded. Only latest fetch retained.
**FAIL**: Both fetches in context.

---

#### m19: State Query Supersede (ls, git status, etc.)

**What it validates**: Duplicate state queries are deduplicated.

**Prereq**: `stateQuerySupersede: true` (default)

**Execute**:

```typescript
bash({ command: "ls -la" }) // Turn 1
bash({ command: "git status" }) // Turn 2
bash({ command: "ls -la" }) // Turn 5 (same as turn 1)
// Check stats: should show "📊 query: 1"
```

**PASS**: First `ls -la` superseded by second. `git status` remains (different query).
**FAIL**: Both `ls -la` calls in context.

---

#### m20: Retry-Based Supersede (Failed → Succeeded)

**What it validates**: Failed tool attempts auto-pruned when retry succeeds.

**Prereq**: `pruneRetryParts: true` (default)

**Execute**:

```typescript
bash({ command: "invalid_command_12345" }) // Turn 1 → fails
bash({ command: "echo 'success'" }) // Turn 2 → succeeds (same tool, different params)
```

**Note**: True retry detection requires same tool + same params. For manual testing, verify config is enabled.

**PASS**: Failed attempt not in context after successful operation.
**FAIL**: Failed attempt remains cluttering context.

---

#### m21: Context-Based Supersede

**What it validates**: New `context_prune` calls supersede previous context operations.

**Execute**:

```typescript
// First context prune
context_prune({ action: "discard", targets: [["hash1"]] })
// ... work ...
// Second context prune
context_prune({ action: "discard", targets: [["hash2"]] })
```

**PASS**: Context management overhead doesn't accumulate.
**FAIL**: Multiple context_prune tool calls cluttering context.

---

#### m22: No Cross-File Supersede

**What it validates**: Operations on different files don't interfere.

**Execute**:

```typescript
read({ filePath: "fileA.txt" })
read({ filePath: "fileB.txt" })
write({ filePath: "fileA.txt", content: "x" })
```

**PASS**: fileB read remains unaffected. Only fileA operations superseded.
**FAIL**: fileB read incorrectly removed.

---

### Category 3: Stuck Task Detection (m23-m27)

These test todo reminder functionality and stuck task warnings.

---

#### m23: Stuck Task Detection — Basic

**What it validates**: Tasks `in_progress` for 12+ turns trigger warning.

**Prereq**: `stuckTaskTurns: 12` (default)

**Execute**:

```typescript
// Turn 0: Create task
todowrite({
    todos: [{ id: "stuck", content: "Long task", status: "in_progress" }],
})

// Simulate 12 turns of other work
for (let i = 1; i <= 12; i++) {
    bash({ command: `echo "Turn ${i}"` })
}

// Look for todo reminder with "⚠️ Task Breakdown Suggestion"
```

**PASS**: Reminder appears highlighting stuck task.
**FAIL**: No warning after 12 turns of inactivity.

---

#### m24: Timestamp Preservation

**What it validates**: `inProgressSince` timestamp preserved when content updates.

**Execute**:

```typescript
// Turn 5: Task goes in_progress
todowrite({
    todos: [
        {
            id: "ts-test",
            content: "Original",
            status: "in_progress",
            inProgressSince: 5,
        },
    ],
})

// Turn 8: Update content only (keep status)
todowrite({
    todos: [
        {
            id: "ts-test",
            content: "Updated", // Changed
            status: "in_progress", // Same
            inProgressSince: 5, // Should preserve
        },
    ],
})
```

**PASS**: Timestamp remains 5 (not reset to 8).
**FAIL**: Timestamp incorrectly reset to current turn.

---

#### m25: Transition Tracking (pending → in_progress)

**What it validates**: Timestamp set correctly on status transition.

**Execute**:

```typescript
// Turn 0: Create as pending
todowrite({
    todos: [{ id: "trans", content: "Task", status: "pending" }],
})

// Turn 6: Transition to in_progress
todowrite({
    todos: [{ id: "trans", content: "Task", status: "in_progress" }],
})
```

**PASS**: `inProgressSince` set to 6 (transition turn).
**FAIL**: Timestamp set to 0 (creation turn) or not set.

---

#### m26: Multiple Stuck Tasks Priority

**What it validates**: Longest-stuck task highlighted.

**Execute**:

```typescript
// Current turn = 15
todowrite({
    todos: [
        { id: "s1", content: "15 turns stuck", status: "in_progress", inProgressSince: 0 },
        { id: "s2", content: "8 turns stuck", status: "in_progress", inProgressSince: 7 },
    ],
})
```

**PASS**: Reminder prioritizes s1 (15 turns) over s2 (8 turns).
**FAIL**: No prioritization or wrong task highlighted.

---

#### m27: Completed Tasks Excluded

**What it validates**: Completed tasks never flagged as stuck.

**Execute**:

```typescript
// Create task, work 10 turns, complete, work 5 more turns
todowrite({ todos: [{ id: "done", content: "Task", status: "in_progress" }] })
// ... 10 turns of work ...
todowrite({ todos: [{ id: "done", content: "Task", status: "completed" }] })
// ... 5 more turns ...
```

**PASS**: No stuck warning for completed task.
**FAIL**: Warning incorrectly shown for completed task.

---

### Category 4: Reminder Deduplication (m28-m29)

These test that reminders don't accumulate in context.

---

#### m28: Todo Reminder Deduplication

**What it validates**: Only ONE todo reminder exists at a time.

**Prereq**: `todoReminder.enabled: true` (default)

**Execute**:

```typescript
// Trigger multiple reminders by not updating todos
todowrite({ todos: [{ id: "1", content: "Task", status: "pending" }] })
// Wait 5 turns (initial reminder)
// Wait 4 more turns (repeat reminder)
// Wait 4 more turns (another repeat)
```

**PASS**: Context contains only latest reminder. Previous ones auto-superseded.
**FAIL**: Multiple reminder messages in context.

---

#### m29: Automata Mode Reflection

**What it validates**: Automata reflection injects periodically in automata mode.

**Prereq**: `automataMode.enabled: true`, keyword "automata" in conversation

**Execute**:

```typescript
// Say "automata" to activate mode
// ... 8 turns of work ...
```

**PASS**: "🤖 Strategic Reflection" appears periodically.
**FAIL**: No reflection in automata mode.

---

### Category 5: Aggressive Pruning (m30)

Configuration verification for aggressive pruning features.

---

#### m30: Aggressive Pruning Configuration

**What it validates**: All aggressive pruning options correctly configured.

**Execute** (config inspection):

```typescript
read({ filePath: "lib/config/defaults.ts" })
// Verify these defaults:
// - pruneToolInputs: true
// - pruneStepMarkers: true
// - pruneSourceUrls: true
// - pruneFiles: true
// - pruneSnapshots: true
// - pruneRetryParts: true
// - pruneUserCodeBlocks: true
// - aggressiveFilePrune: true
// - stateQuerySupersede: true
// - truncateOldErrors: true
```

**Manual Test** — One-File-One-View:

```typescript
read({ filePath: "package.json" })
read({ filePath: "package.json" })
write({ filePath: "package.json", content: "{}" })
edit({ filePath: "package.json", oldString: "{}", newString: '{"x":1}' })
```

**PASS**: Only latest operation on package.json remains. Stats show file supersedes.
**FAIL**: Multiple operations on same file visible.

---

### Category 6: Command Interface (m31)

Testing the `/acp` slash command.

---

#### m31: /acp Command — Stats Display

**What it validates**: Command shows current ACP statistics.

**Execute**:

```
/acp
```

**PASS**: Output shows:

- ACP version
- Current turn count
- Supersede stats (hash, file, todo, url, query, snapshot, retry)
- Manual pruning stats (discard, distill)
- Protected tools list

**FAIL**: Command not recognized or stats missing.

---

## ✅ Validation Checklists

### Pre-Flight (Before Any Manual Tests)

- [ ] `npx tsc --noEmit` passes with no errors
- [ ] `npm run test` passes (all 517+ tests)
- [ ] `npm test -- tests/e2e/` passes (all 159 E2E tests)
- [ ] Plugin built: `npm run build`
- [ ] ACP loaded in opencode session (`/acp` responds)
- [ ] Config verified: aggressiveFilePrune, pruneStepMarkers enabled

### Core Operations Checklist (m1-m12)

- [ ] Tool hash discard works
- [ ] Message hash discard works
- [ ] Thinking block discard auto-converts to distill
- [ ] Batch operations work (mixed types)
- [ ] Distill tool output works
- [ ] Distill message part works
- [ ] Distill reasoning block works
- [ ] Replace action works with patterns
- [ ] Protected tools reject discard attempts
- [ ] Custom protected tools respected
- [ ] Hash format validation rejects invalid formats
- [ ] Graceful error handling for edge cases

### Auto-Supersede Checklist (m13-m22)

- [ ] Hash-based: Duplicate operations supersede
- [ ] File-based: Write supersedes read
- [ ] File-based: Edit supersedes write/read
- [ ] Todo-based: todowrite supersedes previous
- [ ] Todo-based: todoread supersedes previous
- [ ] URL-based: Same URL fetches dedup
- [ ] State query: Same queries dedup
- [ ] Retry-based: Failed attempts pruned on success
- [ ] Context-based: context_prune calls supersede
- [ ] Cross-file: Different files don't interfere

### Stuck Task Checklist (m23-m27)

- [ ] Detection: 12+ turns triggers warning
- [ ] Timestamp preserved on content updates
- [ ] Transition tracking: pending→in_progress sets timestamp
- [ ] Priority: Longest stuck highlighted first
- [ ] Completed tasks excluded from detection

### Reminders & Commands Checklist (m28-m31)

- [ ] Todo reminders deduplicated (only one exists)
- [ ] Automata reflection appears in automata mode
- [ ] `/acp` command shows stats

### Post-Test Cleanup

- [ ] Test files removed (`test-file.txt`, `other-file.txt`, etc.)
- [ ] Manual test results recorded
- [ ] Any failures documented with reproduction steps

---

## 📝 Executable Test Todo List

Copy this JSON array into `todowrite()` to track manual test progress:

```json
[
    {
        "id": "prep-1",
        "content": "PHASE 1: Run npx tsc --noEmit",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "prep-2",
        "content": "PHASE 1: Run npm run test (all pass)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "prep-3",
        "content": "PHASE 1: Run npm test -- tests/e2e/",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "prep-4",
        "content": "PHASE 1: Run npm run build",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "prep-5",
        "content": "PHASE 1: Verify /acp command responds",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "m1",
        "content": "PHASE 2: m1 - Discard tool output by hash",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "m2",
        "content": "PHASE 2: m2 - Discard message part by hash",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "m3",
        "content": "PHASE 2: m3 - Discard thinking block (safety check)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "m4",
        "content": "PHASE 2: m4 - Mixed batch discard (tool+msg+thinking)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "m5",
        "content": "PHASE 2: m5 - Distill tool output with summary",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "m6",
        "content": "PHASE 2: m6 - Distill message part with summary",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "m7",
        "content": "PHASE 2: m7 - Distill reasoning block with summary",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "m8",
        "content": "PHASE 2: m8 - Replace action with pattern matching",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "m9",
        "content": "PHASE 2: m9 - Protected tools rejection",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "m10",
        "content": "PHASE 2: m10 - Custom protected tools",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "m11",
        "content": "PHASE 2: m11 - Hash format validation",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "m12",
        "content": "PHASE 2: m12 - Graceful error handling",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "m13",
        "content": "PHASE 2: m13 - Hash-based supersede",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "m14",
        "content": "PHASE 2: m14 - File supersede (write > read)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "m15",
        "content": "PHASE 2: m15 - File supersede (edit > write)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "m16",
        "content": "PHASE 2: m16 - Todo supersede (todowrite)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "m17",
        "content": "PHASE 2: m17 - Todo supersede (todoread)",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "m18",
        "content": "PHASE 2: m18 - URL-based supersede",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "m19",
        "content": "PHASE 2: m19 - State query supersede",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "m20",
        "content": "PHASE 2: m20 - Retry-based supersede",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "m21",
        "content": "PHASE 2: m21 - Context-based supersede",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "m22",
        "content": "PHASE 2: m22 - No cross-file supersede",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "m23",
        "content": "PHASE 2: m23 - Stuck task detection (12 turns)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "m24",
        "content": "PHASE 2: m24 - Timestamp preservation",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "m25",
        "content": "PHASE 2: m25 - Transition tracking",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "m26",
        "content": "PHASE 2: m26 - Multiple stuck tasks priority",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "m27",
        "content": "PHASE 2: m27 - Completed tasks excluded",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "m28",
        "content": "PHASE 2: m28 - Todo reminder dedup",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "m29",
        "content": "PHASE 2: m29 - Automata mode reflection",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "m30",
        "content": "PHASE 2: m30 - Aggressive pruning config + one-file-one-view",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "m31",
        "content": "PHASE 2: m31 - /acp command stats",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "post-1",
        "content": "POST: Generate pass/fail summary report",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "post-2",
        "content": "POST: Document any failures with reproduction steps",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "post-3",
        "content": "POST: Clean up test files",
        "status": "pending",
        "priority": "medium"
    }
]
```

---

## 🎓 Pro Tips for Manual Testing

1. **Hash Capture**: Note hashes immediately — they're shown in tool output as `<tool_hash>XXXXXX</tool_hash>`
2. **Check Stats**: Use `/acp` frequently to verify supersede counts
3. **Turn Simulation**: Use loops with lightweight commands (`bash({command: "echo 't'"})`) to simulate turn progression
4. **Protected Awareness**: Remember `task`, `todowrite`, `write`, `edit` cannot be pruned
5. **Provider Testing**: If using Anthropic/DeepSeek/Kimi, verify m3 (thinking safety) — this prevents 400 errors
6. **Pattern Matching**: For m8 (replace), ensure patterns are unique and >15 characters

---

## ⚠️ Common Failures & Fixes

| Symptom                | Likely Cause                   | Fix                                                  |
| ---------------------- | ------------------------------ | ---------------------------------------------------- |
| `Invalid hash format`  | Uppercase or wrong length      | Use lowercase 6-char hex only                        |
| `protected` error      | Trying to prune protected tool | Don't discard task/todowrite/write/edit              |
| 400 error after prune  | Thinking block fully removed   | Upgrade ACP — should auto-convert discard→distill    |
| No supersede stats     | Config disabled                | Check `aggressiveFilePrune`, `pruneSourceUrls`, etc. |
| Reminder not appearing | Reminder disabled              | Check `todoReminder.enabled` in config               |

---

**End of Validation Guide v3.0**
