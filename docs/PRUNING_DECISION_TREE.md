# Context Pruning Decision Tree

## Interactive Flowchart for Pruning Decisions

```
START: Do you need to prune context?
│
├─ YES → How much context pressure?
│        │
│        ├─ LIGHT (<50% used)
│        │   └─ Action: No pruning needed
│        │       "Context is healthy"
│        │
│        ├─ MODERATE (50-75% used)
│        │   └─ What type of content dominates?
│        │       │
│        │       ├─ Old tool outputs
│        │       │   └─ Run: context({ action: "discard", targets: [[hash1], [hash2]] })
│        │       │
│        │       ├─ Old messages
│        │       │   └─ Run: context({ action: "discard", targets: [[msg_hash]] })
│        │       │
│        │       └─ Large thinking blocks
│        │           └─ Run: context({ action: "distill", targets: [[thinking_hash, "Analysis complete"]] })
│        │
│        ├─ HIGH (75-90% used)
│        │   └─ Is there critical information to preserve?
│        │       │
│        │       ├─ YES → Use ANCHOR strategy first
│        │       │   ├─ Capture critical info in todos
│        │       │   ├─ Distill important analysis
│        │       │   └─ Then: context({ action: "discard", targets: [[old_hashes]] })
│        │       │
│        │       └─ NO → Aggressive prune
│        │           └─ Run: context({ action: "discard", targets: [[all_disposable_hashes]] })
│        │               (Manual option - removes everything eligible)
│        │
│        └─ CRITICAL (>90% used)
│            └─ URGENT: Can you complete current task without history?
│                │
│                ├─ YES → NUCLEAR + focus mode
│                │   ├─ context({ action: "discard", targets: [[all_hashes]] })
│                │   ├─ todowrite({ todos: [minimal_current_task] })
│                │   └─ Work with clean slate
│                │
│                └─ NO → Surgical prune + anchor
│                    ├─ Identify 3-5 most important items
│                    ├─ Anchor them (todowrite or distill)
│                    ├─ context({ action: "discard", targets: [[tool_hashes]] })
│                    └─ context({ action: "discard", targets: [[msg_hashes]] })
│
└─ NO → Are you sure?
    ├─ Check context size
    │   └─ If >50 turns, reconsider
    └─ Continue working
        "Prune proactively, not reactively"


ANCHOR STRATEGY (Preserve Critical Info)
│
├─ What to anchor?
│   ├─ User requirements → todowrite({ todos: [{ content: "REQ: User wants X" }] })
│   ├─ Key findings → context({ action: "distill", targets: [[hash, "Found: Y issue"]] })
│   ├─ Active file edits → Keep recent read/edit of files being modified
│   └─ Current task state → Update todo with detailed status
│
└─ How to anchor?
    ├─ Distill → Keep conclusion, discard elaboration
    ├─ Todo-ize → Convert to structured task item
    └─ Summarize → 1-2 sentence version of long content


CONTENT TYPE PRUNING GUIDE
│
├─ File Contents
│   ├─ Currently editing → KEEP
│   ├─ Edited 5+ turns ago → DISCARD (re-read if needed)
│   └─ Never accessed → Never loaded, no action
│
├─ Tool Outputs
│   ├─ Recent (last 3 turns) → KEEP
│   ├─ Referenced in todos → DISTILL
│   └─ Old and unreferenced → DISCARD
│
├─ Thinking Blocks
│   ├─ Contains decision rationale → DISTILL
│   ├─ Exploratory analysis → DISCARD
│   └─ Current reasoning → KEEP
│
├─ Error Outputs
│   ├─ Current debugging → KEEP
│   ├─ Resolved issues → DISCARD
│   └─ Old errors (3+ turns) → AUTO-PRUNED
│
└─ Assistant Messages
    ├─ Recent responses → KEEP
    ├─ Contain user requirements → DISTILL
    └─ Acknowledgments → DISCARD


PROTECTION CHECKLIST (Never Prune These)
│
├─ ☐ Active todo items
├─ ☐ Current task description
├─ ☐ User instructions (current turn)
├─ ☐ Files being actively edited
├─ ☐ Protected tool outputs (todowrite, task, etc.)
└─ ☐ Recent error context (if debugging)


QUICK DIAGNOSTICS
│
├─ Symptoms of context bloat:
│   ├─ Responses getting slower
│   ├─ References to "earlier in conversation" fail
│   ├─ Forgot user requirements from 10+ turns ago
│   └─ Tool calls timing out
│ ├─ Check if prune is working:
│   ├─ Run: context({ action: "discard", targets: [[hash]] })
│   ├─ Look for: "pruned: read..."

│   └─ If "No eligible tool outputs" → Already pruned or protected
│
└─ Verify critical info preserved:
    ├─ Run: todoread()
    ├─ Check: Are your key todos still there?
    └─ If missing → Reduce pruning aggressiveness


ADVANCED: SUPersede VALIDATION
│
├─ Test hash-based:
│   └─ read({ filePath: "x" }); read({ filePath: "x" });
│       └─ Should see supersede stats
│
├─ Test file-based:
│   └─ read({ filePath: "x" }); write({ filePath: "x", content: "y" });
│       └─ Read should be superseded
│
└─ Test todo-based:
    └─ todowrite({ todos: [v1] }); todowrite({ todos: [v2] });
        └─ Only v2 should exist


RECOVERY: If You Pruned Too Much
│
├─ Don't panic
├─ Check todos: todoread()
│   └─ Critical info might be there
├─ Re-read critical files
│   └─ read({ filePath: "important-file.ts" })
├─ Ask user to repeat requirements
│   └─ "To ensure accuracy, could you restate the key requirements?"
└─ Learn for next time
    └─ Use CANARY TEST before aggressive pruning


METRICS TO TRACK
│
├─ Turns elapsed
│   └─ Prune every 10-15 turns proactively
│ ├─ Tool calls generated
│   └─ After 20+ tools, batch discard

│
├─ Context "feel"
│   ├─ Heavy/Slow → Prune now
│   ├─ Light/Fast → Good
│   └─ Forgot something → Pruned too aggressively
│
└─ Success rate
    ├─ Track: Did pruning help or hurt?
    ├─ Adjust strategy based on results
    └─ Build personal pruning intuition
```

---

## Visual: The Pruning Funnel

```
RAW CONTEXT (100%)
       │
       ▼
┌─────────────────┐
│  Auto-Supersede │ ← Removes duplicates
│  - Hash-based   │   (transparent)
│  - File-based   │
│  - Todo-based   │
└────────┬────────┘
         │ ~20% removed
         ▼
┌─────────────────┐
│ Manual Pruning  │ ← Your control
│ - By Hash       │   (explicit)
│                 │
│                 │
└────────┬────────┘
         │ ~40% removed
         ▼
┌─────────────────┐
│ Auto-Prune      │ ← Background cleanup
│ - Old errors    │   (automatic)
│ - Superseded    │
│ - Expired       │
└────────┬────────┘
         │ ~10% removed
         ▼
┌─────────────────┐
│ ACTIVE CONTEXT  │ ← What's left (30%)
│ - Critical info │   (most important)
│ - Current work  │
│ - Recent tools  │
└─────────────────┘
```

---

## Color-Coded Priority System

Use this to tag your todos for pruning safety:

```typescript
// 🔴 CRITICAL - Never prune, anchor immediately
todowrite({
    todos: [
        {
            id: "crit-1",
            content: "🔴 CRITICAL: User requirement - must support dark mode",
            status: "pending",
        },
    ],
})

// 🟡 IMPORTANT - Keep unless absolutely necessary
todowrite({
    todos: [
        {
            id: "imp-1",
            content: "🟡 IMPORTANT: Architecture decision - using Strategy pattern",
            status: "pending",
        },
    ],
})

// 🟢 NORMAL - Can be distilled or pruned
todowrite({
    todos: [
        {
            id: "norm-1",
            content: "🟢 NORMAL: Research notes on library options",
            status: "pending",
        },
    ],
})

// 🔵 EPHEMERAL - Safe to discard anytime
todowrite({
    todos: [
        {
            id: "eph-1",
            content: "🔵 EPHEMERAL: Debug log from test run",
            status: "completed",
        },
    ],
})
```

**Pruning Rule**: Never discard 🔴, rarely discard 🟡, distill 🟢, discard 🔵 freely.

---

## Emergency Protocols

### Protocol A: Context Overflow Emergency

```
Symptoms:
- Can't execute new tools
- "Context limit reached" errors
- Agent unresponsive

Actions:
1. todowrite({ todos: [absolute_minimum] }) // Keep only 1-2 critical todos
2. context({ action: "discard", targets: [[all_hashes]] }) // Nuclear option
3. Work with clean slate, re-read only what's needed
```

### Protocol B: Forgot Critical Info

```
Symptoms:
- "What was I supposed to do again?"
- User requirements lost
- Task context missing

Actions:
1. todoread() // Check if in todos
2. Ask user: "To ensure accuracy, could you confirm the key requirements?"
3. Re-read recent files
4. Update todos with better anchoring
```

### Protocol C: Over-Pruning Recovery

```
Symptoms:
- Lost work references
- Can't continue task
- Context too clean

Actions:
1. Don't prune further
2. Re-execute recent tool calls to restore context
3. Re-establish file context with read()
4. Re-anchor in todos before next prune
```

---

**Remember**: Pruning is a skill. Start conservative, learn your patterns, optimize over time.
