# Test Prompt: Unified Context Tool Validation

## Objective

Validate the new unified `context` tool that replaces 6 separate pruning tools and supports advanced pattern matching.

---

## Pre-Test Preparation & Requirements

### Agent Preparation Checklist

Before executing any tests, ensure the following requirements are met:

#### 1. Static Code Analysis (Pre-Flight Check)

**Run static tests first** - Check for type errors and issues without fixing:

```bash
# Run TypeScript type checking
npx tsc --noEmit

# Run linting (if available)
npm run lint

# Run build verification (if available)
npm run build
```

**Agent Instructions**:

- Execute static checks to establish baseline
- Document any errors found (do NOT fix them)
- Note: Some type errors may be expected in test code
- Proceed with validation tests regardless of static check results

**Purpose**: Identify potential environmental issues before running dynamic tests.

---

#### 2. Environment Configuration

| Config Key            | Required Value      | Test Groups        |
| --------------------- | ------------------- | ------------------ |
| `aggressiveFilePrune` | `true`              | Tests 35-36, 38-39 |
| `pruneStepMarkers`    | `true`              | Test 37            |
| `pruneFiles`          | `true`              | Test 42            |
| `stuckTaskTurns`      | `12`                | Tests 23-27        |
| `protectedTools`      | Must include `task` | Test 21            |

**Verification Command** (run before testing):

```bash
# Verify plugin is active and config loaded
/acp stats
# Expected: Shows plugin version and config summary
```

#### 2. Test File Preparation

Create the following test files **before** starting tests:

**File: `test-file.txt`** (for Tests 16, 35)

```
Test content line 1
Test content line 2
Test content line 3
```

**File: `other-file.txt`** (for Test 20)

```
Other file content for cross-file supersede testing
```

**File: `package.json` must exist** (Tests 1, 7, 15, 17, 36)

- Use the actual package.json in the repo

**Verification**:

```bash
read({ filePath: "test-file.txt" })
read({ filePath: "other-file.txt" })
read({ filePath: "package.json" })
```

#### 3. Turn-Based Testing Methodology

Many tests require simulating "turns" of work. Follow this protocol:

**Definition of a "turn"**: Each assistant response + user interaction cycle = 1 turn

**How to advance turns for testing**:

1. After triggering an action, perform minimal work (e.g., `todoread()` or simple `glob`)
2. Count each response cycle as 1 turn
3. Use `todowrite` to track turn counts if needed

**Example - Advancing 3 turns**:

```
Turn 1: User: "check status" → Agent: todoread()
Turn 2: User: "continue" → Agent: glob({ pattern: "*.md" })
Turn 3: User: "proceed" → Agent: Now ready for supersede test
```

#### 4. Hash Capture Protocol

Each test requires capturing tool output hashes. Follow this pattern:

**Step 1**: Execute tool and note the hash

```
read({ filePath: "package.json" })
# Output shows: 439da4 (example hash)
```

**Step 2**: Record in test trail

```json
{
    "testId": "test-1",
    "timestamp": "2026-02-04T10:00:00Z",
    "tool": "read",
    "params": { "filePath": "package.json" },
    "capturedHash": "439da4",
    "turnNumber": 5
}
```

**Step 3**: Use in context call

```
context({ action: "discard", targets: [["439da4"]] })
```

#### 5. Message Hash Capture

For tests involving message pruning (Tests 2, 5, 8, etc.):

**Note**: Message hashes are assigned via `hashToMessagePart` mapping. These are visible in:

- Plugin debug logs (if enabled)
- Assistant message metadata

**Method**: When an assistant message is generated, note its assigned hash from the context system.

#### 6. Test Trail & Re-evaluation Log

Maintain this trail structure for each test:

```markdown
### Test Execution Trail: {testId}

**Pre-conditions**:

- [ ] Config verified
- [ ] Test files exist
- [ ] Turn count recorded

**Execution**:
| Step | Action | Hash Captured | Timestamp |
|------|--------|---------------|-----------|
| 1 | read package.json | abc123 | 10:05:00 |
| 2 | Advance 2 turns | - | 10:06:00 |
| 3 | context discard | abc123 | 10:07:00 |

**Result**: PASS / FAIL / PARTIAL

**Evidence**:

- `/acp stats` output: [paste here]
- prune state: [paste relevant state]

**Re-evaluation Notes**:

- [ ] Re-runnable with captured hashes
- [ ] Config dependencies documented
- [ ] Turn count requirements clear
```

#### 7. Protected Tools Verification

Before Test 21, verify protected tools:

```bash
# Check if 'task' tool is protected
# Look in plugin config for protectedTools array
# Should include: ['task', ...]
```

If not configured, tests requiring protected tool exclusion cannot proceed.

#### 8. Snapshot Testing Prerequisites

For Test 40 (Snapshot Auto-Supersede):

**Requirement**: Snapshot tool/plugin must be available
**Preparation**:

1. Verify snapshot capability exists
2. Create test snapshot trigger mechanism
3. If snapshot not available, mark test as SKIPPED in trail

#### 9. Extended Thinking Mode

For Tests 31, 33 (Thinking Block pruning):

**Requirement**: Extended thinking mode must be enabled
**Activation**: Usually triggered by complex reasoning tasks or explicit configuration
**Verification**: Thinking blocks appear with hash markers in output

#### 10. Failure Recovery Protocol

If a test fails, follow this trail for re-evaluation:

```markdown
**Failure Point**: {which step failed}
**Captured State**:

- Current turn: {number}
- Prune arrays state: {json}
- Soft prune cache: {json}

**Re-evaluation Steps**:

1. Restore from checkpoint: [checkpoint method]
2. Re-run from step: {step number}
3. Verify pre-conditions again
```

---

### Quick Start Checklist for Agents

Before running ANY test:

- [ ] Read this entire preparation section
- [ ] Run static tests (`npx tsc --noEmit`, `npm run lint`) - document errors only
- [ ] Verify `/acp stats` works and shows plugin info
- [ ] Create test files: `test-file.txt`, `other-file.txt`
- [ ] Confirm `package.json` is readable
- [ ] Verify config: `aggressiveFilePrune=true`, `pruneStepMarkers=true`
- [ ] Set up turn counter tracking (use todo list)
- [ ] Prepare hash capture template
- [ ] Confirm at least 10 turns available for stuck task tests
- [ ] Verify thinking mode available (for Tests 31, 33)
- [ ] Confirm snapshot tool available (for Test 40)

**Trail Template Location**: Create `docs/test_trail.md` to log all executions

---

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

## Aggressive Pruning Tests (New)

Tests for the new aggressive context pruning features added to reduce token usage by ~50%.

### Test 35: Input Leak Fix - Supersede Strips Tool Input

**Objective**: Verify that superseded tools have their inputs stripped to metadata only.

**Steps**:

1. `write({ filePath: "test.txt", content: "A".repeat(1000) })` — Write a large file
2. Do other work for 1+ turn
3. `write({ filePath: "test.txt", content: "new" })` — Supersede the first write
4. Check that the first write's input was stripped

**Expected**:

- First write's `state.input` shows only `{ filePath: "test.txt" }`, NOT the full content
- Large content removed from input to save tokens

---

### Test 36: One-File-One-View Policy

**Objective**: Verify any file operation supersedes ALL previous operations on same file.

**Steps**:

1. `read({ filePath: "package.json" })` — Read file
2. Do other work for 1+ turn
3. `read({ filePath: "package.json" })` — Read same file again
4. Run `/acp stats`

**Expected**:

- First read superseded by second read (not just write→read)
- Stats show `📁 file: 1 prune`
- With `aggressiveFilePrune: true`, any file op supersedes previous

---

### Test 37: Step Marker Filtering

**Objective**: Verify step-start and step-finish markers are filtered from context.

**Steps**:

1. Ensure `pruneStepMarkers: true` in config
2. Agent performs tasks that generate step markers
3. Check context sent to model

**Expected**:

- No `step-start` parts in context
- No `step-finish` parts in context
- Tokens saved from structural markers (~3% reduction)

---

### Test 38: Source-URL Supersede

**Objective**: Verify webfetch/websearch results supersede older fetches of same URL.

**Steps**:

1. `webfetch({ url: "https://example.com" })` — Fetch URL
2. Do other work for 1+ turn
3. `webfetch({ url: "https://example.com" })` — Fetch same URL again
4. Run `/acp stats`

**Expected**:

- First fetch superseded by second fetch
- Stats show `🔗 url: 1 prune`
- Only latest fetch result visible

---

### Test 39: State Query Supersede

**Objective**: Verify state queries (ls, find, git status) only keep latest.

**Steps**:

1. `bash({ command: "ls -la" })` — List files
2. Do other work for 1+ turn
3. `bash({ command: "ls -la" })` — List again
4. Run `/acp stats`

**Expected**:

- First `ls` superseded by second `ls`
- Stats show `📊 query: 1 prune`
- Only latest directory state visible

---

### Test 40: Snapshot Auto-Supersede

**Objective**: Verify only the latest snapshot is retained.

**Steps**:

1. Trigger snapshot operation (via plugin or tool)
2. Do other work for 1+ turn
3. Trigger another snapshot
4. Run `/acp stats`

**Expected**:

- First snapshot superseded by second
- Stats show `📸 snapshot: 1 prune`
- Only latest snapshot in context (opt-out config)

---

### Test 41: Retry Auto-Prune

**Objective**: Verify failed attempts are pruned when retry succeeds.

**Steps**:

1. Trigger a tool that fails (e.g., `read({ filePath: "/nonexistent" })`)
2. Retry same tool with same params that succeeds
3. Run `/acp stats`

**Expected**:

- Failed attempt automatically pruned
- Stats show `🔄 retry: 1 prune`
- Only successful result visible

---

### Test 42: File Part Masking

**Objective**: Verify file attachments are masked with breadcrumbs.

**Steps**:

1. Ensure `pruneFiles: true` in config
2. Operation generates file attachments (images, documents)
3. Check context

**Expected**:

- File parts replaced with breadcrumb: `[File: image.png, 12KB]`
- Original file data not sent to model
- Hash tracked in `hashRegistry.fileParts`

---

### Test 43: User Code Block Truncation

**Objective**: Verify large code blocks in old user messages are truncated.

**Steps**:

1. User sends message with large code block (10+ lines)
2. Do 5+ turns of work
3. Check context

**Expected**:

- Code block replaced with: `[Code block: typescript, 15 lines - truncated to save context]`
- Only visible in messages older than 5 turns
- Short blocks (<4 lines) preserved

---

### Test 44: Error Output Truncation

**Objective**: Verify old error outputs are truncated to first line.

**Steps**:

1. Trigger tool that fails with verbose error
2. Do 3+ turns of work
3. Check context

**Expected**:

- Error output shows: `Error: Something failed\n[Error output truncated - 500 chars total]`
- Only first line preserved
- Recent errors (<3 turns) kept intact

---

### Test 45: Compaction Awareness

**Objective**: Verify already-compacted content is not double-processed.

**Steps**:

1. Tool output is compacted by OpenCode (sets `time.compacted`)
2. Plugin processes messages
3. Check behavior

**Expected**:

- Tool parts with `time.compacted` field skipped
- No double-pruning of already-compacted content
- Respects OpenCode's native compaction

---

## Aggressive Pruning Validation Checklist

- [ ] Input leak fixed: superseded tools show metadata-only inputs
- [ ] One-file-one-view: reads supersede reads, any op supersedes previous
- [ ] Step markers: filtered from context entirely
- [ ] Source-url supersede: same URL fetches deduplicated
- [ ] State query supersede: ls/find/git status keep only latest
- [ ] Snapshot supersede: only latest snapshot retained (opt-out)
- [ ] Retry auto-prune: failed attempts removed on success
- [ ] File part masking: attachments replaced with breadcrumbs
- [ ] User code truncation: old large code blocks truncated
- [ ] Error truncation: old errors truncated to first line
- [ ] Compaction awareness: respects OpenCode's `time.compacted`

---

## Test Trail Documentation

### Required Trail Files

Agents must maintain these trail files for re-evaluation:

**1. `docs/test_trail.md`** - Master execution log

````markdown
# Test Execution Trail

## Session Info

- Started: {timestamp}
- Agent: {agent_id}
- Plugin Version: {from /acp stats}

## Environment Verification

- [ ] Config checked: aggressiveFilePrune=true
- [ ] Config checked: pruneStepMarkers=true
- [ ] Config checked: stuckTaskTurns=12
- [ ] Test files created
- [ ] Protected tools verified

## Execution Log

### Test 1: Basic Discard - Tool Hash

**Status**: PENDING
**Pre-conditions Met**: [ ] Yes [ ] No
**Hashes Captured**:

- read package.json: {hash}

**Steps Executed**:

1. {action} - Result: {success/fail}
2. {action} - Result: {success/fail}

**Evidence**:

```json
/acp stats output:
[paste here]
```
````

**Result**: PASS / FAIL / PARTIAL
**Notes for Re-evaluation**:

- Retry with same hash: {hash}
- Turn offset: {number}

````

**2. `docs/test_checkpoint_{N}.md`** - State snapshots
- Capture at key milestones (every 10 tests)
- Include prune state, turn count, config

**3. `docs/test_failures.md`** - Failure analysis
```markdown
# Failed Tests Log

## Test X: {name}
**Failure Mode**: {description}
**Captured State**:
- Turn: {number}
- prune.toolIds: [array]
- prune.messagePartIds: [array]

**Root Cause Hypothesis**: {analysis}
**Reproduction Steps**: {numbered list}
**Fix Required**: [ ] Config [ ] Code [ ] Test Design
````

### Hash Registry

Maintain a running registry of captured hashes:

| Test ID | Tool    | Params       | Hash   | Turn | Used In |
| ------- | ------- | ------------ | ------ | ---- | ------- |
| t1      | read    | package.json | abc123 | 5    | discard |
| t2      | message | "hello"      | def456 | 7    | discard |
| t3      | glob    | "\*_/_.ts"   | ghi789 | 9    | distill |

### Re-evaluation Protocol

When re-evaluating a failed test:

1. **Restore Checkpoint**: Use latest checkpoint before failed test
2. **Verify Hashes**: Check if hashes are still valid (may change between sessions)
3. **Re-capture if Needed**: If hashes invalidated, re-run from beginning of test
4. **Compare States**: Diff prune state between original and re-run
5. **Document Differences**: Note any state divergence in trail

---

## Executable Todo List for Agents

Copy this to `todowrite` to track test execution. **Include preparation tasks first**:

```json
[
    {
        "id": "prep-0",
        "content": "PREP: Run static tests (npx tsc --noEmit, npm run lint) - Document but don't fix errors",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "prep-1",
        "content": "PREP: Verify plugin active - Run /acp stats and document version",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "prep-2",
        "content": "PREP: Check config - aggressiveFilePrune, pruneStepMarkers, stuckTaskTurns",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "prep-3",
        "content": "PREP: Create test files - test-file.txt, other-file.txt",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "prep-4",
        "content": "PREP: Verify package.json readable for test dependency",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "prep-5",
        "content": "PREP: Check protectedTools config includes 'task'",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "prep-6",
        "content": "PREP: Initialize test trail - Create docs/test_trail.md with header",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "prep-7",
        "content": "PREP: Set up hash capture template in trail file",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "prep-8",
        "content": "PREP: Verify extended thinking mode available (for Tests 31, 33)",
        "status": "pending",
        "priority": "low"
    },
    {
        "id": "prep-9",
        "content": "PREP: Verify snapshot tool available (for Test 40)",
        "status": "pending",
        "priority": "low"
    },
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
    },
    {
        "id": "t35",
        "content": "Test 35: Input Leak Fix - Supersede Strips Tool Input",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t36",
        "content": "Test 36: One-File-One-View Policy",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t37",
        "content": "Test 37: Step Marker Filtering",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t38",
        "content": "Test 38: Source-URL Supersede",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t39",
        "content": "Test 39: State Query Supersede",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t40",
        "content": "Test 40: Snapshot Auto-Supersede",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t41",
        "content": "Test 41: Retry Auto-Prune",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t42",
        "content": "Test 42: File Part Masking",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t43",
        "content": "Test 43: User Code Block Truncation",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t44",
        "content": "Test 44: Error Output Truncation",
        "status": "pending",
        "priority": "low"
    },
    {
        "id": "t45",
        "content": "Test 45: Compaction Awareness",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "report-1",
        "content": "POST-TEST: Generate summary report from test_trail.md",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "report-2",
        "content": "POST-TEST: Verify all validation checklists marked complete",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "report-3",
        "content": "POST-TEST: Document any skipped tests and reasons",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "report-4",
        "content": "POST-TEST: Create re-evaluation guide for failed tests",
        "status": "pending",
        "priority": "medium"
    }
]
```

---

## Post-Test Reporting & Re-evaluation Guide

### Final Report Structure

After completing all tests, generate:

**File: `docs/test_report_{timestamp}.md`**

````markdown
# Context Tool Validation Report

## Executive Summary

- Tests Planned: 45
- Tests Passed: {count}
- Tests Failed: {count}
- Tests Skipped: {count}
- Overall Status: PASS / FAIL / PARTIAL

## Environment

- Plugin Version: {version}
- Test Date: {date}
- Duration: {time}

## Results by Category

### Core Functionality (Tests 1-14)

| Test | Status | Evidence                   |
| ---- | ------ | -------------------------- |
| T1   | PASS   | Hash abc123 discarded      |
| T2   | FAIL   | Message hash lookup failed |
| ...  | ...    | ...                        |

### Auto-Supersede (Tests 15-22)

[Same table format]

### Stuck Task Detection (Tests 23-27)

[Same table format]

[Additional categories...]

## Issues Found

1. **Issue**: {description}
    - Affected Tests: {list}
    - Severity: High/Medium/Low
    - Recommendation: {action}

## Re-evaluation Instructions

### For Complete Re-run

1. Reset all preparation tasks
2. Clear test trail files
3. Re-execute from prep-0

### For Selective Re-run (Failed Tests Only)

1. Reference test_trail.md for captured hashes
2. Verify hashes still valid in current session
3. Re-run specific tests with documented parameters

### For Regression Testing

1. Use checkpoint files to restore state
2. Run affected test category only
3. Compare results with baseline report

## Appendix: Captured Hash Registry

[Full hash table from execution]

## Appendix: Config Snapshot

```json
{
  "aggressiveFilePrune": true,
  "pruneStepMarkers": true,
  "stuckTaskTurns": 12,
  "protectedTools": ["task", ...]
}
```
````

```

### Re-evaluation Criteria

A test is considered **successfully re-evaluated** when:

1. **Same Result Achieved**: Pass/fail status matches original
2. **State Consistency**: prune arrays show equivalent state
3. **Evidence Preserved**: /acp stats output comparable
4. **Timing Independence**: Result not dependent on specific turn count

A test requires **design revision** when:

1. **Inconsistent Results**: Passes in one run, fails in another
2. **Hash Sensitivity**: Results depend on specific hash values
3. **Timing Sensitivity**: Results depend on precise turn counts
4. **Config Dependency**: Requires non-default configuration

### Trail Archival

Preserve these files for audit:
- `docs/test_trail.md` → `docs/archive/test_trail_{date}.md`
- `docs/test_report_{timestamp}.md` → `docs/archive/`
- Any checkpoint files → `docs/archive/checkpoints/`

---

**End of Test Prompt**
```
