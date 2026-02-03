# Auto-Supersede System

Automatic context cleanup that runs in `syncToolCache()` before any agentic strategies.

## Supersede Types

| Type     | Trigger                 | Action                                  | Emoji |
| -------- | ----------------------- | --------------------------------------- | ----- |
| **Hash** | Same tool + same params | Supersede old call, keep new            | 🔄    |
| **File** | write/edit to file      | Clear old read/write/edit for same file | 📁    |
| **Todo** | todowrite or todoread   | Clear all old todowrite AND todoread    | ✅    |

## Execution Order

```
syncToolCache()              ← AUTO-SUPERSEDE runs here
├── 1. Hash-based supersede  (same params → supersede old)
├── 2. File-based supersede  (write/edit → clear old read/write/edit)
├── 3. Todo supersede        (todowrite/todoread → clear both old)
└── 4. Track in_progress     (set/preserve inProgressSince for stuck detection)

[agentic strategies run AFTER]
├── purgeErrors()
├── truncateLargeOutputs()
├── compressThinkingBlocks()
└── prune()
```

## Hash-Based Supersede

When the same tool is called with identical parameters:

- The **old** call is superseded (soft-pruned)
- The **new** call keeps its hash
- Prevents duplicate tool outputs in context

```
read(filePath: "/src/app.ts")  ← Turn 1 (superseded)
read(filePath: "/src/app.ts")  ← Turn 5 (kept)
```

## File-Based Supersede

When a file is written or edited:

- All previous read/write/edit calls for that file are superseded
- The new write/edit is kept
- Prevents stale file content in context

```
read(filePath: "/src/app.ts")   ← Turn 1 (superseded)
read(filePath: "/src/app.ts")   ← Turn 3 (superseded)
edit(filePath: "/src/app.ts")   ← Turn 5 (kept - triggers supersede)
```

### File Key Extraction

| Tool              | Key Format                        |
| ----------------- | --------------------------------- |
| read, write, edit | `filePath`                        |
| glob              | `glob:{path}:{pattern}`           |
| grep              | `grep:{path}:{pattern}:{include}` |

## Todo-Based Supersede

When todowrite or todoread is called:

- All previous todowrite calls are superseded (except latest)
- All previous todoread calls are superseded (except latest)
- Keeps context focused on current todo state

```
todowrite([...])  ← Turn 1 (superseded)
todoread()        ← Turn 2 (superseded)
todowrite([...])  ← Turn 5 (superseded)
todowrite([...])  ← Turn 8 (kept)
todoread()        ← Turn 9 (kept)
```

## Stuck Task Detection

When a task stays `in_progress` for too long (default: 12 turns), the system injects guidance suggesting task breakdown.

### How It Works

1. **Tracking**: When `todowrite` is called, the system compares old vs new todos
2. **Timestamp**: Tasks transitioning to `in_progress` get `inProgressSince` set to current turn
3. **Preservation**: Tasks already `in_progress` preserve their original timestamp
4. **Detection**: During reminder injection, tasks with `(currentTurn - inProgressSince) >= stuckTaskTurns` trigger guidance

### Configuration

```json
{
    "tools": {
        "todoReminder": {
            "enabled": true,
            "initialTurns": 8,
            "repeatTurns": 4,
            "stuckTaskTurns": 12
        }
    }
}
```

### Guidance Message

When stuck tasks are detected, the reminder includes:

```
⚠️ **Task Breakdown Suggestion**
A task has been in progress for {N} turns. If you're finding it difficult to complete, consider:
- Breaking it into smaller, more specific subtasks
- Identifying blockers or dependencies that need resolution first
- Marking it as blocked and moving to another task

Use `todowrite` to split the task or update its status.
```

### Example Flow

```
Turn 1:  todowrite([{id: "1", status: "pending"}])
Turn 3:  todowrite([{id: "1", status: "in_progress"}])  ← inProgressSince = 3
Turn 5:  todowrite([{id: "1", status: "in_progress"}])  ← inProgressSince preserved = 3
...
Turn 15: Todo reminder injected with stuck task guidance (15 - 3 = 12 turns)
```

## Reminder Deduplication

Both reminder types ensure only ONE instance exists at any time:

| Reminder Type           | Cleanup Logic                                        |
| ----------------------- | ---------------------------------------------------- |
| **Todo Reminder**       | `removeTodoReminder()` called before injection       |
| **Automata Reflection** | `removeAutomataReflection()` called before injection |

This prevents context fragmentation from multiple stale reminders.

## Protection Rules

Auto-supersede respects:

- **Turn protection**: Tools in protected turns are not superseded
- **Protected tools**: Tools in `protectedTools` config are not superseded
- **In-progress tools**: Only completed tools can be superseded
- **Same-turn tools**: Tools in the current turn are not superseded

## Stats Tracking

Stats are tracked under `strategyStats.autoSupersede`:

```typescript
autoSupersede: {
    hash: { count: number; tokens: number },
    file: { count: number; tokens: number },
    todo: { count: number; tokens: number },
}
```

View with `/acp stats`:

```
Strategy Effectiveness:
────────────────────────────────────────────────────────────
  Auto-Supersede        12 prunes, ~8.5k saved ⭐
    🔄 hash              5 prunes, ~4.2k
    📁 file              4 prunes, ~3.1k
    ✅ todo              3 prunes, ~1.2k
```

## Log Format

```
[auto-supersede] 🔄 hash abc123: call_001 → call_002
[auto-supersede] 📁 file /src/app.ts: read call_001 superseded by write
[auto-supersede] ✅ todo: pruned old todowrite call_001
```
