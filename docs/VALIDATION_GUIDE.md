# Test Prompt: Unified Context Tool Validation

## Objective

Validate the unified `context` tool that replaces 6 separate pruning tools with 1 interface supporting advanced pattern matching.

**Total Tests: 43**

---

## Quick Start for Agents

1. **Load test todos**: Copy the JSON from "Executable Todo List" section into `todowrite()`
2. **Run preparation tasks**: Complete `prep-0` through `prep-7`
3. **Execute tests**: Run `t1` through `t43` sequentially
4. **Generate report**: Complete `report-1` through `report-4`

---

## Tool Interface

```typescript
context({
  action: "discard" | "distill",
  targets: [string, string?][]  // [[target, summary?], ...]
})
```

### Target Types (Auto-detected)

| Type            | Format                                       | Lookup                |
| --------------- | -------------------------------------------- | --------------------- |
| Tool outputs    | `a1b2c3` (6 hex)                             | `hashToCallId`        |
| Message parts   | `a1b2c3` (6 hex)                             | `hashToMessagePart`   |
| Reasoning parts | `a1b2c3` (6 hex)                             | `hashToReasoningPart` |
| Bulk patterns   | `[tools]`, `[messages]`, `[thinking]`, `[*]` | Direct                |

---

## Test Cases

### Core Context Operations (t1-t12)

#### Test 1: Basic Discard - Tool Hash

**Setup**: `read({ filePath: "package.json" })` — generates hash
**Action**: `context({ action: "discard", targets: [["<hash>"]] })`
**Expected**: Tool output added to `prune.toolIds`

---

#### Test 2: Basic Discard - Message Hash

**Setup**: Assistant message with hash via `hashToMessagePart`
**Action**: `context({ action: "discard", targets: [["<hash>"]] })`
**Expected**: Message part added to `prune.messagePartIds`

---

#### Test 3: Mixed Discard - Tool + Message Hash

**Setup**: Tool output + message, both with hashes
**Action**: `context({ action: "discard", targets: [["<tool_hash>"], ["<msg_hash>"]] })`
**Expected**: Both added to respective prune arrays

---

#### Test 4: Distill Tool Output

**Setup**: `glob({ pattern: "**/*.ts" })` — generates hash
**Action**: `context({ action: "distill", targets: [["<hash>", "Found 73 TS files"]] })`
**Expected**: Tool added to `prune.toolIds`, summary in `softPrunedTools`

---

#### Test 5: Distill Message Hash

**Setup**: Message with hash
**Action**: `context({ action: "distill", targets: [["<hash>", "Architecture summary"]] })`
**Expected**: Message added to `prune.messagePartIds`, summary stored

---

#### Test 6: Mixed Distill - Tool + Message Hash

**Setup**: Tool + message with hashes
**Action**: `context({ action: "distill", targets: [["<tool>", "summary1"], ["<msg>", "summary2"]] })`
**Expected**: Both distilled with summaries

---

#### Test 7: Bulk Operations - [tools]

**Setup**: Multiple tool outputs
**Action**: `context({ action: "discard", targets: [["[tools]"]] })`
**Expected**: All eligible tools discarded, protected tools excluded

---

#### Test 8: Bulk Operations - [messages]

**Setup**: Multiple message parts
**Action**: `context({ action: "discard", targets: [["[messages]"]] })`
**Expected**: All eligible messages discarded

---

#### Test 9: Bulk Operations - [*]/[all]

**Setup**: Mix of tools and messages
**Action**: `context({ action: "discard", targets: [["[*]"]] })`
**Expected**: All tools, messages, and thinking blocks discarded

---

#### Test 10: Bulk Distill with Summary

**Setup**: Multiple tools
**Action**: `context({ action: "distill", targets: [["[tools]", "Research complete"]] })`
**Expected**: All tools distilled with shared summary

---

#### Test 11: Protected Tools Exclusion

**Setup**: Tools including protected ones (`task` in config)
**Action**: `context({ action: "discard", targets: [["[tools]"]] })`
**Expected**: Protected tools NOT discarded

---

#### Test 12: Graceful Error Handling

**Action**:

1. `context({ action: "distill", targets: [["abc123"]] })` — missing summary
2. `context({ action: "discard", targets: [["zzzzzz"]] })` — invalid hash

**Expected**: Graceful error messages, no crash

---

### Auto-Supersede (t13-t20)

#### Test 13: Hash-Based Supersede

**Steps**:

1. `read({ filePath: "package.json" })`
2. Do other work (1+ turn)
3. `read({ filePath: "package.json" })` again

**Expected**: First read auto-superseded, stats show `🔄 hash: 1`

---

#### Test 14: File-Based Supersede (Write)

**Steps**:

1. `read({ filePath: "test-file.txt" })`
2. Do other work
3. `write({ filePath: "test-file.txt", content: "new" })`

**Expected**: Read superseded by write, stats show `📁 file: 1`

---

#### Test 15: File-Based Supersede (Edit)

**Steps**:

1. `read({ filePath: "package.json" })`
2. Do other work
3. `edit({ filePath: "package.json", ... })`

**Expected**: Read superseded by edit

---

#### Test 16: Todo-Based Supersede (todowrite)

**Steps**:

1. `todowrite({ todos: [...] })`
2. Do other work
3. `todowrite({ todos: [...] })` again

**Expected**: First todowrite superseded, stats show `✅ todo: 1`

---

#### Test 17: Todo-Based Supersede (todoread)

**Steps**: Call `todoread()` twice with work between
**Expected**: First todoread superseded

---

#### Test 18: No Supersede for Different Files

**Steps**:

1. `read({ filePath: "package.json" })`
2. `write({ filePath: "other-file.txt", content: "..." })`

**Expected**: package.json read NOT superseded

---

#### Test 19: No Supersede for Protected Tools

**Steps**: Call protected tool (`task`) twice
**Expected**: Neither call superseded

---

#### Test 20: Combined Auto-Supersede Stats

**Steps**: Trigger hash, file, and todo supersedes
**Expected**: Stats show breakdown by type

---

### Stuck Task Detection (t21-t25)

#### Test 21: Stuck Task Detection - Basic

**Steps**:

1. `todowrite` with `status: "in_progress"`
2. Work for 12+ turns without updating

**Expected**: Reminder shows "⚠️ Task Breakdown Suggestion"

---

#### Test 22: Stuck Task Detection - Timestamp Preservation

**Steps**: Update in_progress task content (not status)
**Expected**: `inProgressSince` preserved from first transition

---

#### Test 23: Stuck Task Detection - New Task Transition

**Steps**: Task goes pending → in_progress at turn 6
**Expected**: Stuck detection starts from turn 6, not creation

---

#### Test 24: Stuck Task Detection - Multiple Stuck Tasks

**Steps**: Two tasks stuck for different durations
**Expected**: Guidance shows longest stuck duration

---

#### Test 25: Stuck Task Detection - Completed Task Clears

**Steps**: Complete a task before threshold
**Expected**: No stuck guidance for completed tasks

---

### Reminder Deduplication (t26-t28)

#### Test 26: Todo Reminder Deduplication

**Steps**: Trigger multiple todo reminders
**Expected**: Only ONE reminder exists at any time

---

#### Test 27: Automata Reflection Deduplication

**Steps**: Trigger multiple automata reflections
**Expected**: Only ONE reflection exists at any time

---

#### Test 28: Mixed Reminders Coexistence

**Steps**: Trigger both reminder types
**Expected**: One of each type can coexist

---

### Thinking Block & Message Pruning (t29-t32)

#### Test 29: Pruning Thinking Blocks

**Steps**:

1. Generate thinking block with hash
2. `context({ action: "discard", targets: [["<thinking_hash>"]] })`

**Expected**: Thinking block added to `prune.reasoningPartIds`

---

#### Test 30: Pruning Assistant Messages

**Steps**:

1. Note message hash
2. `context({ action: "discard", targets: [["<msg_hash>"]] })`

**Expected**: Message shows `[Assistant message part removed to save context]`

---

#### Test 31: Distill Thinking Block

**Steps**: `context({ action: "distill", targets: [["<hash>", "Analysis summary"]] })`
**Expected**: Thinking distilled with summary preserved

---

#### Test 32: Bulk Prune All Content Types

**Steps**: `context({ action: "discard", targets: [["[*]"]] })`
**Expected**: Tools, messages, AND thinking blocks all pruned

---

### Aggressive Pruning (t33-t43)

#### Test 33: Input Leak Fix - Supersede Strips Tool Input

**Steps**: Write large file, then write again to same file
**Expected**: First write's input stripped to metadata only

---

#### Test 34: One-File-One-View Policy

**Steps**: Read same file twice
**Expected**: First read superseded (with `aggressiveFilePrune: true`)

---

#### Test 35: Step Marker Filtering

**Requirement**: `pruneStepMarkers: true`
**Expected**: No step-start/step-finish parts in context

---

#### Test 36: Source-URL Supersede

**Steps**: `webfetch` same URL twice
**Expected**: First fetch superseded, stats show `🔗 url: 1`

---

#### Test 37: State Query Supersede

**Steps**: `bash({ command: "ls -la" })` twice
**Expected**: First ls superseded, stats show `📊 query: 1`

---

#### Test 38: Snapshot Auto-Supersede

**Steps**: Trigger two snapshots
**Expected**: Only latest snapshot retained

---

#### Test 39: Retry Auto-Prune

**Steps**: Failed tool call, then successful retry
**Expected**: Failed attempt auto-pruned

---

#### Test 40: File Part Masking

**Requirement**: `pruneFiles: true`
**Expected**: File attachments replaced with breadcrumbs

---

#### Test 41: User Code Block Truncation

**Steps**: Large code block in user message, 5+ turns later
**Expected**: Code block truncated in old messages

---

#### Test 42: Error Output Truncation

**Steps**: Verbose error, 3+ turns later
**Expected**: Error truncated to first line

---

#### Test 43: Compaction Awareness

**Steps**: Tool with `time.compacted` field
**Expected**: Already-compacted content not double-processed

---

## Validation Checklists

### Core Operations

- [ ] Tool hashes auto-detected (6 hex chars)
- [ ] Message hashes looked up via `hashToMessagePart`
- [ ] Reasoning hashes looked up via `hashToReasoningPart`
- [ ] Bulk patterns `[tools]`, `[messages]`, `[thinking]`, `[*]` work
- [ ] Discard adds to prune arrays
- [ ] Distill stores summaries
- [ ] Mixed targets work in single call
- [ ] Protected tools excluded from bulk

### Auto-Supersede

- [ ] Hash-based supersede works
- [ ] File-based supersede works
- [ ] Todo-based supersede works
- [ ] Different files not cross-superseded
- [ ] Protected tools not superseded

### Aggressive Pruning

- [ ] Input leak fixed
- [ ] One-file-one-view works
- [ ] Step markers filtered
- [ ] URL supersede works
- [ ] State query supersede works
- [ ] Error truncation works

---

## Executable Todo List for Agents

**IMPORTANT**: Copy this entire JSON array into `todowrite()` before starting tests.

```json
[
    {
        "id": "prep-0",
        "content": "PREP: Run static tests (npx tsc --noEmit) - document errors only",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "prep-1",
        "content": "PREP: Verify plugin active via /acp stats",
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
        "content": "PREP: Verify package.json readable",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "prep-5",
        "content": "PREP: Check protectedTools includes 'task'",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "prep-6",
        "content": "PREP: Create docs/test_trail.md",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "prep-7",
        "content": "PREP: Verify extended thinking mode available",
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
        "content": "Test 7: Bulk Operations - [tools]",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t8",
        "content": "Test 8: Bulk Operations - [messages]",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t9",
        "content": "Test 9: Bulk Operations - [*]/[all]",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t10",
        "content": "Test 10: Bulk Distill with Summary",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t11",
        "content": "Test 11: Protected Tools Exclusion",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t12",
        "content": "Test 12: Graceful Error Handling",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t13",
        "content": "Test 13: Hash-Based Supersede",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t14",
        "content": "Test 14: File-Based Supersede (Write)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t15",
        "content": "Test 15: File-Based Supersede (Edit)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t16",
        "content": "Test 16: Todo-Based Supersede (todowrite)",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t17",
        "content": "Test 17: Todo-Based Supersede (todoread)",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t18",
        "content": "Test 18: No Supersede for Different Files",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t19",
        "content": "Test 19: No Supersede for Protected Tools",
        "status": "pending",
        "priority": "low"
    },
    {
        "id": "t20",
        "content": "Test 20: Combined Auto-Supersede Stats",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t21",
        "content": "Test 21: Stuck Task Detection - Basic",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t22",
        "content": "Test 22: Stuck Task Detection - Timestamp Preservation",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t23",
        "content": "Test 23: Stuck Task Detection - New Task Transition",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t24",
        "content": "Test 24: Stuck Task Detection - Multiple Stuck Tasks",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t25",
        "content": "Test 25: Stuck Task Detection - Completed Task Clears",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t26",
        "content": "Test 26: Todo Reminder Deduplication",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t27",
        "content": "Test 27: Automata Reflection Deduplication",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t28",
        "content": "Test 28: Mixed Reminders Coexistence",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t29",
        "content": "Test 29: Pruning Thinking Blocks",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t30",
        "content": "Test 30: Pruning Assistant Messages",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t31",
        "content": "Test 31: Distill Thinking Block",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t32",
        "content": "Test 32: Bulk Prune All Content Types",
        "status": "pending",
        "priority": "high"
    },
    { "id": "t33", "content": "Test 33: Input Leak Fix", "status": "pending", "priority": "high" },
    {
        "id": "t34",
        "content": "Test 34: One-File-One-View Policy",
        "status": "pending",
        "priority": "high"
    },
    {
        "id": "t35",
        "content": "Test 35: Step Marker Filtering",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t36",
        "content": "Test 36: Source-URL Supersede",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t37",
        "content": "Test 37: State Query Supersede",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t38",
        "content": "Test 38: Snapshot Auto-Supersede",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t39",
        "content": "Test 39: Retry Auto-Prune",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t40",
        "content": "Test 40: File Part Masking",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t41",
        "content": "Test 41: User Code Block Truncation",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "t42",
        "content": "Test 42: Error Output Truncation",
        "status": "pending",
        "priority": "low"
    },
    {
        "id": "t43",
        "content": "Test 43: Compaction Awareness",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "report-1",
        "content": "POST: Generate summary report",
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
        "content": "POST: Document skipped tests",
        "status": "pending",
        "priority": "medium"
    },
    {
        "id": "report-4",
        "content": "POST: Create re-evaluation guide",
        "status": "pending",
        "priority": "medium"
    }
]
```

---

## Environment Configuration

| Config Key            | Required Value  | Tests   |
| --------------------- | --------------- | ------- |
| `aggressiveFilePrune` | `true`          | t33-t34 |
| `pruneStepMarkers`    | `true`          | t35     |
| `pruneFiles`          | `true`          | t40     |
| `stuckTaskTurns`      | `12`            | t21-t25 |
| `protectedTools`      | includes `task` | t19     |

---

## Report Template

After tests, create `docs/test_report_{date}.md`:

```markdown
# Context Tool Validation Report

## Summary

- Tests Planned: 43
- Tests Passed: {count}
- Tests Failed: {count}
- Tests Skipped: {count}

## Results by Category

| Category           | Tests   | Passed |
| ------------------ | ------- | ------ |
| Core Operations    | t1-t12  | /12    |
| Auto-Supersede     | t13-t20 | /8     |
| Stuck Task         | t21-t25 | /5     |
| Reminders          | t26-t28 | /3     |
| Thinking/Message   | t29-t32 | /4     |
| Aggressive Pruning | t33-t43 | /11    |
```

---

**End of Validation Guide**
