# Controlled Context Architecture

## Strategic Memory Management with Fake Data Patterns

**Concept**: Use simulated/fake data to test pruning capabilities while preserving critical operational memory.

---

## The Memory Retention Hierarchy

Not all context is equal. Rank your content by **retention priority**:

| Priority         | Content Type                                       | Prune Strategy       |
| ---------------- | -------------------------------------------------- | -------------------- |
| 🔴 **Critical**  | Active todo state, current task, user instructions | **NEVER** prune      |
| 🟡 **Important** | File contents being edited, recent tool results    | Distill with summary |
| 🟢 **Ephemeral** | Old tool outputs, completed analysis, logs         | Discard aggressively |
| ⚫ **Temporary** | Error outputs, retry attempts, superseded content  | Auto-prune           |

---

## Fake Data Patterns for Testing

### Pattern 1: Simulated Thinking Blocks

**Purpose**: Test thinking block pruning without requiring extended thinking mode.

```typescript
// Generate fake thinking that LOOKS real
const fakeThinking = `
Analyzing codebase structure...
- Found 15 TypeScript files
- 3 core modules identified
- 2 potential optimizations detected

Processing dependencies...
- Tree depth: 4 levels
- Circular refs: 0
- Orphaned modules: 2

Conclusion: Refactoring recommended for lib/utils.ts
`

// In practice, thinking blocks are auto-generated during analysis
// But you can identify them by the hash tag:
// <thinking_hash>abc123</thinking_hash>
```

**Pruning Strategy**:

```typescript
// Option A: Prune specific thinking
context({ action: "discard", targets: [["abc123"]] })

// Option B: Bulk prune ALL thinking (nuclear option)
context({ action: "discard", targets: [["[thinking]"]] })

// Option C: Distill to preserve conclusion
context({
    action: "distill",
    targets: [["abc123", "Analysis: Refactor lib/utils.ts"]],
})
```

---

### Pattern 2: Synthetic Tool Outputs

**Purpose**: Test supersede mechanisms without real file operations.

```typescript
// Instead of expensive real operations:
read({ filePath: "node_modules/.../large-file.js" }) // SLOW

// Use lightweight synthetic data:
read({ filePath: "test-file.txt" }) // FAST
write({ filePath: "test-file.txt", content: "v1" })
write({ filePath: "test-file.txt", content: "v2" })
write({ filePath: "test-file.txt", content: "v3" })
```

**Why This Works**:

- Same supersede behavior as real files
- Instant execution
- No side effects
- Predictable hash generation

---

### Pattern 3: Simulated Message Chains

**Purpose**: Test message pruning without complex user interactions.

```typescript
// Generate message chain artificially
bash({ command: "echo 'Message 1'" })
bash({ command: "echo 'Message 2'" })
bash({ command: "echo 'Message 3'" })

// Each creates an assistant response with message_hash
// Then prune them strategically:

// Keep recent, prune old
context({ action: "discard", targets: [["msg_old1"], ["msg_old2"]] })

// Or bulk prune
context({ action: "discard", targets: [["[messages]"]] })
```

---

### Pattern 4: Turn Simulation Loops

**Purpose**: Test stuck task detection without waiting 12 real turns.

```typescript
// Instead of:
// [Wait 12 actual user interactions...]

// Do:
for (let i = 1; i <= 12; i++) {
    bash({ command: `echo "Simulating turn ${i}"` })
}

// Result: Stuck task detection triggers immediately
```

**Critical Memory Preservation**:

```typescript
// BEFORE simulation - save what's important
todowrite({
    todos: [
        {
            id: "critical-task",
            content: "REMEMBER: User wants X feature",
            status: "in_progress",
        },
    ],
})

// Run simulation loop
for (let i = 1; i <= 20; i++) {
    bash({ command: "echo '.'" }) // Filler turns
}

// AFTER simulation - critical task still in memory
// Stuck task reminder will fire, but context preserved
```

---

## The "Memory Anchor" Technique

**Problem**: Aggressive pruning might remove context you need later.

**Solution**: Use **distill** to create memory anchors:

```typescript
// BEFORE: Large analysis with 2000+ tokens
read({ filePath: "lib/complex-module.ts" })
// ...extensive analysis output...

// ANCHOR: Distill to 50 tokens
todowrite({
    todos: [
        {
            id: "analysis-summary",
            content: "📊 COMPLEX-MODULE: 3 exports, 2 circular deps, needs refactor",
            status: "pending",
        },
    ],
})

// NOW: Can safely prune the analysis
context({ action: "discard", targets: [["large_analysis_hash"]] })

// LATER: Still remember the key findings via todo
```

---

## Context Budgeting Strategy

Allocate your context window like a budget:

```
Total Context Budget: ~128k tokens

┌─────────────────────────────────────┐
│ System Instructions    │ 5k  │ 4%  │ ← Fixed
├─────────────────────────────────────┤
│ Active Todos           │ 2k  │ 2%  │ ← Critical
├─────────────────────────────────────┤
│ Current File Context   │ 10k │ 8%  │ ← Important
├─────────────────────────────────────┤
│ Recent Tool Results    │ 15k │ 12% │ ← Important
├─────────────────────────────────────┤
│ Working Memory         │ 20k │ 16% │ ← Variable
├─────────────────────────────────────┤
│ Historical Context     │ 76k │ 60% │ ← Prune aggressively
└─────────────────────────────────────┘
```

**Pruning Triggers**:

- Historical context > 80k tokens → Bulk discard `[tools]`
- Historical context > 100k tokens → Nuclear option `[*]`
- Thinking blocks > 20k tokens → Distill or discard `[thinking]`

---

## Advanced: Selective Amnesia

**Concept**: Intentionally forget specific details while retaining structure.

```typescript
// Example: Forget file contents but remember structure

// Original context:
// [Full contents of 50 files]

// After strategic pruning:
todowrite({
    todos: [
        { id: "f1", content: "src/config.ts - CONFIG OBJECT (pruned, see file)" },
        { id: "f2", content: "src/utils.ts - 3 helper functions (pruned, see file)" },
        { id: "f3", content: "src/main.ts - ENTRY POINT (pruned, see file)" },
    ],
})

// Bulk prune all file contents
context({ action: "discard", targets: [["[tools]"]] })

// Result: Know WHAT files exist and their PURPOSE
// But don't waste tokens on full contents
// Can re-read specific files when needed
```

---

## Testing the Limits: Safe Experiments

Use fake data to find your pruning limits without risk:

```typescript
// EXPERIMENT: How much can I prune before losing critical info?

// Setup: Create "canary" tasks
todowrite({
    todos: [
        { id: "canary1", content: "CRITICAL: Remember to update X" },
        { id: "canary2", content: "CRITICAL: User wants Y feature" },
    ],
})

// Test 1: Aggressive prune
context({ action: "discard", targets: [["[*]"]] })
// Check: Did canaries survive?

// Test 2: Nuclear prune
context({ action: "discard", targets: [["[*]"]] })
context({ action: "discard", targets: [["[thinking]"]] })
// Check: Did canaries survive?

// Find the threshold where critical info is lost
// That's your "do not cross" line
```

---

## Real-World Example: Multi-File Refactoring

**Scenario**: Refactor 20 files while maintaining context.

```typescript
// PHASE 1: Discovery (keep details)
for (const file of files) {
    read({ filePath: file })
}
// Context: 20 full file contents

// PHASE 2: Analysis (distill findings)
todowrite({
    todos: files.map((f, i) => ({
        id: `file-${i}`,
        content: `${f}: ${analyzeFile(f)}`, // 1-line summary
        status: "pending",
    })),
})

// PHASE 3: Prune discovery data
context({ action: "discard", targets: [["[tools]"]] })
// Context: Now just 20 summaries in todos, not 20 full files

// PHASE 4: Execute refactoring
// Re-read files one at a time as needed
// Context stays lean, work continues efficiently
```

---

## The Golden Rule

> **Prune the elaborate, anchor the essential.**

**Elaborate** (Safe to prune):

- Full file contents you've already analyzed
- Old tool outputs from completed steps
- Thinking blocks whose conclusions you've captured
- Superseded versions of anything

**Essential** (Must preserve):

- Current task state and todos
- User requirements and constraints
- Recent analysis conclusions
- Active file edit context

---

## Quick Reference: Prune Decision Matrix

| Content                       | Age     | Size   | Action                        |
| ----------------------------- | ------- | ------ | ----------------------------- |
| File content I just read      | Current | Large  | **Keep** (actively using)     |
| File content from 5 turns ago | Old     | Large  | **Discard** (can re-read)     |
| Analysis thinking             | Current | Large  | **Distill** (keep conclusion) |
| Error output                  | Current | Small  | **Keep** (debugging)          |
| Error output from 3+ turns    | Old     | Any    | **Discard** (or auto-pruned)  |
| Todo list                     | Current | Small  | **Keep** (critical state)     |
| Old todo versions             | Old     | Small  | **Discard** (superseded)      |
| Message chain                 | Current | Medium | **Keep** (recent context)     |
| Old messages                  | Old     | Medium | **Discard** via `[messages]`  |

---

**Remember**: Context pruning is not about memory loss—it's about **strategic forgetting**. Keep what matters, shed what doesn't.
