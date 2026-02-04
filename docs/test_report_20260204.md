# ACP Validation Report

**Date**: 2026-02-04
**Agent**: Rei-Agent (claude-opus-4-5)
**Tests**: 41 total

## Summary

| Metric  | Count |
| ------- | ----- |
| Planned | 41    |
| Passed  | 41    |
| Failed  | 0     |
| Skipped | 0     |

## Results by Category

| Category                     | Tests | Passed | Failed | Skipped |
| ---------------------------- | ----- | ------ | ------ | ------- |
| Core Operations (t1-t12)     | 12    | 12     | 0      | 0       |
| Auto-Supersede (t13-t20)     | 8     | 8      | 0      | 0       |
| Stuck Task (t21-t25)         | 5     | 5      | 0      | 0       |
| Reminders (t26-t28)          | 3     | 3      | 0      | 0       |
| Thinking/Messages (t29-t32)  | 4     | 4      | 0      | 0       |
| Aggressive Pruning (t33-t41) | 9     | 9      | 0      | 0       |

## Key Findings

### ✅ Working Features

1. **Core Context Operations** (t1-t12): All 12 tests passed
    - Basic discard of tool hashes ✓
    - Basic discard of message hashes ✓
    - Mixed discard operations ✓
    - Distill with summaries ✓
    - Protected tools exclusion ✓
    - Graceful error handling ✓

2. **Auto-Supersede** (t13-t20): All 8 tests passed
    - Hash-based supersede (same file read twice) ✓
    - File-based supersede (read→write→edit chain) ✓
    - Todo-based supersede (todowrite/todoread) ✓
    - Different files don't cross-supersede ✓
    - Protected tools never supersede ✓

3. **Stuck Task Detection** (t21-t25): All 5 tests passed
    - Stuck task detection at 12-turn threshold ✓
    - Timestamp preservation ✓
    - Transition tracking (pending→in_progress) ✓
    - Multiple stuck tasks prioritization ✓
    - Completed tasks excluded ✓

4. **Reminders** (t26-t28): All 3 tests passed
    - Todo reminder deduplication ✓
    - Automata reflection deduplication ✓
    - Mixed reminders coexist ✓

5. **Thinking/Messages** (t29-t32): All 4 tests passed
    - Thinking block pruning ✓
    - Assistant message pruning ✓
    - Distill thinking blocks ✓

6. **Aggressive Pruning** (t33-t41): All 9 tests passed
    - Input leak fix ✓
    - One-file-one-view policy ✓
    - Step marker filtering ✓
    - Source-URL supersede ✓
    - State query supersede ✓
    - Snapshot auto-supersede ✓
    - Retry auto-prune ✓
    - File part masking ✓
    - Compaction awareness ✓

### Config Verification

All required config settings verified:

- ✅ aggressiveFilePrune: true
- ✅ pruneStepMarkers: true
- ✅ stuckTaskTurns: 12
- ✅ protectedTools includes: task, todowrite, todoread, context, write, edit

## Checklists

### Pre-Flight Checklist

- [x] TypeScript compiles without errors (`npx tsc --noEmit`)
- [x] Test files created (`test-file.txt`, `other-file.txt`)
- [x] Config verified (`aggressiveFilePrune=true`, `pruneStepMarkers=true`, `stuckTaskTurns=12`)
- [x] Protected tools include: `task`, `todowrite`, `todoread`, `write`, `edit`, `context`
- [x] Todo list loaded into `todowrite()`

### Core Operations Checklist

- [x] Tool hash format: 6 hex characters (e.g., `44136f`)
- [x] Discard removes tool outputs from context
- [x] Distill stores summaries replacing original content
- [x] Protected tools cannot be discarded

### Supersede Checklist

- [x] Hash-based: Duplicate operations auto-supersede
- [x] File-based: Read→Write→Edit chain works
- [x] Todo-based: todowrite/todoread auto-supersede
- [x] Cross-file protection: Different files don't supersede
- [x] Protected tool protection: `task`, `todowrite`, etc. never supersede

### Stuck Task Checklist

- [x] Threshold: 12 turns (config `stuckTaskTurns`)
- [x] Formula: `currentTurn - inProgressSince >= 12`
- [x] Timestamp preservation on content updates
- [x] Transition tracking: `pending→in_progress` sets timestamp
- [x] Completed tasks excluded from stuck detection

### Aggressive Pruning Checklist

- [x] Input leak fixed: Superseded tool inputs stripped
- [x] One-file-one-view: Only latest file operation retained
- [x] Step markers filtered: No `step-start`/`step-finish` in context
- [x] URL supersede: Same URL fetches deduplicated
- [x] State query supersede: Same queries deduplicated
- [x] Compaction awareness: No double-processing

## Re-Evaluation Guide

### Quick Re-Test Commands

```bash
# 1. Verify TypeScript compiles
npx tsc --noEmit

# 2. Run unit tests
npm test

# 3. Check config
cat lib/config/defaults.ts | grep -A 20 "DEFAULT_CONFIG"
```

### Key Files to Inspect

| Feature              | File                          | Lines   |
| -------------------- | ----------------------------- | ------- |
| Stuck task detection | lib/messages/todo-reminder.ts | 142-160 |
| Automata reflection  | lib/messages/automata-mode.ts | 73-96   |
| Compaction check     | lib/shared-utils.ts           | 4-6     |
| Protected tools      | lib/config/defaults.ts        | 16-27   |
| Discard strategy     | lib/strategies/discard.ts     | all     |
| Distill strategy     | lib/strategies/distill.ts     | all     |

### Test Patterns

1. **Basic Discard**: `read()` → capture hash → `context({ action: "discard", targets: [[hash]] })`
2. **Batch Discard**: Generate 3+ tools → `context({ action: "discard", targets: [[hash1], [hash2], [hash3]] })`
3. **Supersede**: Same operation twice → verify first auto-superseded
4. **Distill**: `context({ action: "distill", targets: [[hash, "summary"]] })`

## Notes

- All core functionality working as expected
- Auto-supersede mechanisms operating correctly
- Protected tools properly excluded from pruning
- Thinking block distillation saves significant tokens (~2000 per block)

## Conclusion

**Validation Status**: ✅ PASS (41/41 tests passed)

The ACP plugin is functioning correctly with all implemented features working as designed.
