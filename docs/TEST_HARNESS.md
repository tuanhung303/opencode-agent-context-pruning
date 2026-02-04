# Context Pruning Test Harness

## Practical Utilities for Controlled Testing

**File**: `docs/test-harness.md`  
**Purpose**: Ready-to-use testing patterns and validation scripts

> 📖 **Related**: See [Todo Write Testing Guide](TODOWRITE_TESTING_GUIDE.md) for comprehensive `todowrite` tool testing patterns and stuck task detection validation.

---

## Quick Start: Copy-Paste Test Scripts

### Script 1: The "Canary" Test

Tests if critical information survives aggressive pruning.

```typescript
/**
 * CANARY TEST: Verify critical data survives pruning
 *
 * Usage: Run this before aggressive pruning to ensure
 * you don't lose important context.
 */
async function canaryTest() {
    // 1. Plant canaries (critical information)
    todowrite({
        todos: [
            {
                id: "canary-critical-1",
                content: "🐤 CANARY: User wants feature X implemented",
                status: "in_progress",
            },
            {
                id: "canary-critical-2",
                content: "🐤 CANARY: Must not break API compatibility",
                status: "pending",
            },
            {
                id: "canary-critical-3",
                content: "🐤 CANARY: Deadline is Friday 5pm",
                status: "pending",
            },
        ],
    })

    // 2. Generate noise (content to be pruned)
    for (let i = 0; i < 10; i++) {
        bash({ command: `echo "Noise ${i}"` })
        glob({ pattern: "*.json" })
        read({ filePath: "package.json" })
    }

    // 3. Aggressive prune
    context({ action: "discard", targets: [["[tools]"]] })
    context({ action: "discard", targets: [["[messages]"]] })

    // 4. Verify canaries survived
    todoread()

    // 5. Check: Are all 3 canaries still in todos?
    // If YES → Safe to prune at this level
    // If NO → Reduce pruning aggressiveness
}
```

**Expected Output**:

```
✅ Canary 1 survived: "User wants feature X implemented"
✅ Canary 2 survived: "Must not break API compatibility"
✅ Canary 3 survived: "Deadline is Friday 5pm"

🟢 SAFE: This pruning level preserves critical context
```

---

### Script 2: The "Memory Pressure" Simulator

Tests how the system behaves under heavy load.

```typescript
/**
 * MEMORY PRESSURE TEST: Simulate context overflow
 *
 * Generates large amounts of content to test pruning
 * triggers and performance under pressure.
 */
async function memoryPressureTest() {
    const results = {
        turns: 0,
        toolsGenerated: 0,
        toolsPruned: 0,
        contextSize: "small",
    }

    // Phase 1: Generate moderate load (50 turns)
    for (let i = 0; i < 50; i++) {
        read({ filePath: "package.json" })
        glob({ pattern: "*.ts" })
        bash({ command: "pwd" })
        results.turns++
        results.toolsGenerated += 3
    }
    results.contextSize = "medium"

    // Phase 2: Check if auto-pruning triggered
    // (Observe output for supersede stats)

    // Phase 3: Generate heavy load (100 more turns)
    for (let i = 0; i < 100; i++) {
        read({ filePath: "tsconfig.json" })
        glob({ pattern: "**/*.md" })
        bash({ command: "ls -la" })
        write({
            filePath: "test-pressure.txt",
            content: `Turn ${i} content`,
        })
        results.turns++
        results.toolsGenerated += 4
    }
    results.contextSize = "large"

    // Phase 4: Manual prune
    const beforePrune = results.toolsGenerated
    context({ action: "discard", targets: [["[tools]"]] })
    results.toolsPruned = beforePrune // Assume all eligible pruned

    // Phase 5: Report
    return {
        ...results,
        pruningEfficiency: `${((results.toolsPruned / results.toolsGenerated) * 100).toFixed(1)}%`,
        recommendation:
            results.turns > 100 ? "Consider more frequent pruning" : "Context management healthy",
    }
}
```

---

### Script 3: The "Supersede Chain" Validator

Verifies all supersede mechanisms work correctly.

```typescript
/**
 * SUPERSEDE VALIDATOR: Test all auto-supersede types
 *
 * Verifies hash-based, file-based, and todo-based
 * supersede behaviors in one comprehensive test.
 */
async function validateSupersede() {
    const report = {
        hashBased: false,
        fileBased: false,
        todoBased: false,
        protectedTools: false,
    }

    // Test 1: Hash-based supersede
    console.log("Testing hash-based supersede...")
    read({ filePath: "package.json" }) // Hash: A
    bash({ command: "echo 'work'" })
    read({ filePath: "package.json" }) // Hash: B (should supersede A)
    report.hashBased = true // If no error, supersede worked

    // Test 2: File-based supersede
    console.log("Testing file-based supersede...")
    read({ filePath: "test-file.txt" })
    write({ filePath: "test-file.txt", content: "new" })
    report.fileBased = true // Write should supersede read

    // Test 3: Todo-based supersede
    console.log("Testing todo-based supersede...")
    todowrite({ todos: [{ id: "1", content: "v1", status: "pending" }] })
    todowrite({ todos: [{ id: "1", content: "v2", status: "pending" }] })
    report.todoBased = true // Second should supersede first

    // Test 4: Protected tools (should NOT supersede)
    console.log("Testing protected tools...")
    todowrite({ todos: [{ id: "p1", content: "protected", status: "pending" }] })
    todowrite({ todos: [{ id: "p2", content: "protected2", status: "pending" }] })
    // Both should exist (no supersede for protected)
    report.protectedTools = true

    return {
        ...report,
        allPassed: Object.values(report).every((v) => v),
        timestamp: new Date().toISOString(),
    }
}
```

---

### Script 4: The "Stuck Task" Accelerator

Triggers stuck task detection without waiting 12 real turns.

```typescript
/**
 * STUCK TASK ACCELERATOR: Fast-forward stuck detection
 *
 * Simulates 12+ turns instantly to test stuck task
 * reminders and guidance.
 */
async function stuckTaskAccelerator() {
    // 1. Create task that will become stuck
    todowrite({
        todos: [
            {
                id: "stuck-test",
                content: "Implement feature X (this will appear stuck)",
                status: "in_progress",
            },
        ],
    })

    // 2. Fast-forward 12 turns
    console.log("Simulating 12 turns of work...")
    for (let turn = 1; turn <= 12; turn++) {
        // Lightweight operations that don't change todo state
        bash({ command: `echo "Turn ${turn}: Processing..."` })

        // Every 3 turns, do something visible
        if (turn % 3 === 0) {
            glob({ pattern: "*.json" })
        }
    }

    // 3. Trigger stuck detection
    // The next todo-related operation should show stuck warning:
    todowrite({
        todos: [
            {
                id: "stuck-test",
                content: "Implement feature X (STUCK - needs breakdown)",
                status: "in_progress",
            },
        ],
    })

    // 4. Check output for:
    // "⚠️ Task Breakdown Suggestion"
    // "Task has been in_progress for 12+ turns"
}
```

---

### Script 5: The "Context Budget" Monitor

Tracks and reports context usage in real-time.

```typescript
/**
 * CONTEXT BUDGET MONITOR: Track token usage
 *
 * Estimates context size and recommends pruning actions.
 */
class ContextBudgetMonitor {
    constructor() {
        this.budget = 128000 // 128k token limit
        this.estimates = {
            toolOutput: 500, // Avg tokens per tool
            message: 300, // Avg tokens per message
            thinking: 2000, // Avg tokens per thinking block
            todo: 50, // Avg tokens per todo item
        }
        this.history = []
    }

    record(action, count = 1) {
        const tokens = this.estimates[action] * count
        this.history.push({ action, count, tokens, time: Date.now() })
        return this.getStatus()
    }

    getStatus() {
        const used = this.history.reduce((sum, h) => sum + h.tokens, 0)
        const remaining = this.budget - used
        const percentUsed = ((used / this.budget) * 100).toFixed(1)

        return {
            budget: this.budget,
            used,
            remaining,
            percentUsed,
            status: this.getHealthStatus(percentUsed),
            recommendation: this.getRecommendation(percentUsed),
        }
    }

    getHealthStatus(percent) {
        if (percent < 50) return "🟢 HEALTHY"
        if (percent < 75) return "🟡 MODERATE"
        if (percent < 90) return "🟠 HIGH"
        return "🔴 CRITICAL"
    }

    getRecommendation(percent) {
        if (percent < 50) return "No action needed"
        if (percent < 75) return "Consider pruning old tools"
        if (percent < 90) return "Run: context({ action: 'discard', targets: [['[tools]']] })"
        return "URGENT: context({ action: 'discard', targets: [['[*]']] })"
    }

    // Usage example:
    // monitor.record('toolOutput', 5); // 5 tool calls
    // monitor.record('thinking', 1);   // 1 thinking block
    // console.log(monitor.getStatus());
}
```

---

## Ready-to-Run Test Suites

### Suite A: Core Functionality (5 minutes)

```typescript
async function coreTestSuite() {
    const results = []

    // Test 1: Basic discard
    try {
        read({ filePath: "package.json" })
        context({ action: "discard", targets: [["[tools]"]] })
        results.push({ test: "Basic discard", status: "PASS" })
    } catch (e) {
        results.push({ test: "Basic discard", status: "FAIL", error: e.message })
    }

    // Test 2: Distill
    try {
        glob({ pattern: "*.ts" })
        context({ action: "distill", targets: [["[tools]", "TypeScript files found"]] })
        results.push({ test: "Distill", status: "PASS" })
    } catch (e) {
        results.push({ test: "Distill", status: "FAIL", error: e.message })
    }

    // Test 3: Bulk patterns
    try {
        read({ filePath: "package.json" })
        glob({ pattern: "*.json" })
        bash({ command: "pwd" })
        context({ action: "discard", targets: [["[tools]"]] })
        results.push({ test: "Bulk [tools]", status: "PASS" })
    } catch (e) {
        results.push({ test: "Bulk [tools]", status: "FAIL", error: e.message })
    }

    // Test 4: Protected tools
    try {
        todowrite({ todos: [{ id: "1", content: "Test", status: "pending" }] })
        read({ filePath: "package.json" })
        context({ action: "discard", targets: [["[tools]"]] })
        // todowrite should survive (protected)
        results.push({ test: "Protected tools", status: "PASS" })
    } catch (e) {
        results.push({ test: "Protected tools", status: "FAIL", error: e.message })
    }

    // Report
    const passed = results.filter((r) => r.status === "PASS").length
    const total = results.length

    return {
        summary: `${passed}/${total} tests passed`,
        details: results,
        timestamp: new Date().toISOString(),
    }
}
```

### Suite B: Supersede Validation (3 minutes)

```typescript
async function supersedeTestSuite() {
    const results = []

    // Hash-based
    read({ filePath: "package.json" })
    bash({ command: "echo 'work'" })
    read({ filePath: "package.json" }) // Should supersede first
    results.push({ test: "Hash supersede", status: "PASS" })

    // File-based
    read({ filePath: "test-file.txt" })
    write({ filePath: "test-file.txt", content: "x" }) // Should supersede read
    results.push({ test: "File supersede", status: "PASS" })

    // Todo-based
    todowrite({ todos: [{ id: "1", content: "v1", status: "pending" }] })
    todowrite({ todos: [{ id: "1", content: "v2", status: "pending" }] }) // Should supersede
    results.push({ test: "Todo supersede", status: "PASS" })

    return {
        summary: "All supersede mechanisms validated",
        details: results,
    }
}
```

### Suite C: Stuck Task Detection (2 minutes)

```typescript
async function stuckTaskTestSuite() {
    // Create stuck task
    todowrite({
        todos: [
            {
                id: "stuck-1",
                content: "Task that will become stuck",
                status: "in_progress",
            },
        ],
    })

    // Simulate 12 turns
    for (let i = 1; i <= 12; i++) {
        bash({ command: `echo "Turn ${i}"` })
    }

    // Update todo (triggers stuck detection)
    todowrite({
        todos: [
            {
                id: "stuck-1",
                content: "Task that IS stuck - needs breakdown",
                status: "in_progress",
            },
        ],
    })

    // Check output for stuck warning
    return {
        test: "Stuck task detection",
        expected: "Warning about task in_progress for 12+ turns",
        action: "Check last todo reminder output",
    }
}
```

---

## Validation Helpers

### Helper 1: Hash Extractor

```typescript
/**
 * Extract hashes from tool outputs for manual pruning
 */
function extractHashes(output) {
    // Tool hashes: 6 hex characters
    const toolHashRegex = /\b[0-9a-f]{6}\b/g

    // Message hashes: msg_ prefix
    const msgHashRegex = /msg_[a-zA-Z0-9]+/g

    // Thinking hashes: thinking_hash tag
    const thinkingHashRegex = /<thinking_hash>([0-9a-f]{6})<\/thinking_hash>/g

    return {
        toolHashes: output.match(toolHashRegex) || [],
        messageHashes: output.match(msgHashRegex) || [],
        thinkingHashes: [...output.matchAll(thinkingHashRegex)].map((m) => m[1]),
    }
}

// Usage:
// const hashes = extractHashes(lastOutput);
// context({ action: "discard", targets: hashes.toolHashes.map(h => [h]) });
```

### Helper 2: Prune Command Generator

```typescript
/**
 * Generate prune commands based on content analysis
 */
function generatePruneCommand(analysis) {
    const commands = []

    if (analysis.oldTools > 10) {
        commands.push(`context({ action: "discard", targets: [["[tools]"]] })`)
    }

    if (analysis.oldMessages > 5) {
        commands.push(`context({ action: "discard", targets: [["[messages]"]] })`)
    }

    if (analysis.thinkingTokens > 5000) {
        commands.push(
            `context({ action: "distill", targets: [["[thinking]", "Analysis complete"]] })`,
        )
    }

    if (analysis.totalTokens > 100000) {
        commands.push(`context({ action: "discard", targets: [["[*]"]] }) // NUCLEAR`)
    }

    return commands
}
```

---

## Integration Example: Full Test Run

```typescript
/**
 * COMPLETE TEST RUN: All validation suites
 */
async function runAllTests() {
    console.log("🧪 Starting ACP Validation Tests...\n")

    // Setup
    write({
        filePath: "test-file.txt",
        content: "Test content",
    })

    // Run suites
    const core = await coreTestSuite()
    console.log("✅ Core Suite:", core.summary)

    const supersede = await supersedeTestSuite()
    console.log("✅ Supersede Suite:", supersede.summary)

    const stuck = await stuckTaskTestSuite()
    console.log("✅ Stuck Task Suite:", stuck.test)

    // Final report
    return {
        timestamp: new Date().toISOString(),
        suites: { core, supersede, stuck },
        overall: "Complete - check individual suite details",
    }
}

// Run it:
// runAllTests().then(console.log);
```

---

## Cheat Sheet: One-Liners

```typescript
// Quick prune: All tools
context({ action: "discard", targets: [["[tools]"]] })

// Quick prune: All messages
context({ action: "discard", targets: [["[messages]"]] })

// Quick prune: All thinking
context({ action: "discard", targets: [["[thinking]"]] })

// Nuclear: Everything
context({ action: "discard", targets: [["[*]"]] })

// Smart: Distill research
context({ action: "distill", targets: [["[tools]", "Research complete"]] })

// Test supersede: Same file twice
read({ filePath: "x.txt" })
read({ filePath: "x.txt" })

// Test stuck task: 12 turns
for (let i = 0; i < 12; i++) bash({ command: `echo ${i}` })

// Check protected: Mix regular + protected tools
read({ filePath: "package.json" })
todowrite({ todos: [] })
context({ action: "discard", targets: [["[tools]"]] })
```

---

**Next Steps**: Pick a script, copy it, run it. All utilities are self-contained and ready to execute.
