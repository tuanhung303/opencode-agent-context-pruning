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
└── 3. Todo supersede        (todowrite/todoread → clear both old)

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
