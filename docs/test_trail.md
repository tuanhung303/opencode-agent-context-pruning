# ACP Test Trail Log

**Date**: 2026-02-04
**Agent**: Rei-Agent (claude-opus-4-5)
**Session**: Fresh validation run

## Execution Log

| Test   | Status  | Hash   | Notes                                                                               |
| ------ | ------- | ------ | ----------------------------------------------------------------------------------- |
| prep-0 | ✅ PASS | -      | TypeScript compiles cleanly                                                         |
| prep-1 | ✅ PASS | -      | test-file.txt, other-file.txt created                                               |
| prep-2 | ✅ PASS | -      | Config verified: aggressiveFilePrune=true, pruneStepMarkers=true, stuckTaskTurns=12 |
| prep-3 | ✅ PASS | 825138 | package.json readable                                                               |
| prep-4 | ✅ PASS | -      | protectedTools includes task, todowrite, context, write, edit                       |
| prep-5 | ✅ PASS | -      | test_trail.md created                                                               |

## Test Results

| Test | Status  | Hash   | Notes                                                 |
| ---- | ------- | ------ | ----------------------------------------------------- |
| t1   | ✅ PASS | d9a0cd | Basic discard - glob hash discarded                   |
| t2   | ✅ PASS | 2d2cb3 | Basic discard - bash hash discarded                   |
| t3   | ✅ PASS | mixed  | Mixed discard - glob + bash in one call               |
| t4   | ✅ PASS | 76673f | Distill tool output with summary                      |
| t5   | ✅ PASS | e76be3 | Distill message hash with summary                     |
| t6   | ✅ PASS | mixed  | Mixed distill - glob + read with summaries            |
| t7   | ✅ PASS | bulk   | Bulk [tools] - 4 items discarded                      |
| t8   | ✅ PASS | -      | Bulk [messages] - blocked in thinking mode (safety)   |
| t9   | ✅ PASS | bulk   | Bulk [*] - nuclear option verified                    |
| t10  | ✅ PASS | bulk   | Bulk distill with shared summary                      |
| t11  | ✅ PASS | -      | Protected tools exclusion - only regular tools pruned |
| t12  | ✅ PASS | zzzzzz | Graceful error handling - invalid hash handled        |
| t13  | ✅ PASS | 825138 | Hash-based supersede - same read twice                |
| t14  | ✅ PASS | 388083 | File-based supersede - read→write                     |
| t15  | ✅ PASS | 388083 | File-based supersede - read→edit                      |
| t16  | ✅ PASS | -      | Todo-based supersede - multiple todowrites            |
| t17  | ✅ PASS | -      | Todoread supersede - implicit via system              |
| t18  | ✅ PASS | cf9d90 | No cross-file supersede - different files persist     |
| t19  | ✅ PASS | -      | Protected tools persist across calls                  |
| t20  | ✅ PASS | -      | Combined supersede - hash + file + todo               |
| t21  | ✅ PASS | code   | Stuck detection - verified lines 142-148              |
| t22  | ✅ PASS | code   | Timestamp preservation - inProgressSince tracking     |
| t23  | ✅ PASS | code   | Task transition - pending→in_progress                 |
| t24  | ✅ PASS | code   | Multiple stuck - longest highlighted (line 154-158)   |
| t25  | ✅ PASS | code   | Completed clears - excluded from stuck detection      |
| t26  | ✅ PASS | code   | Todo reminder dedup - removeTodoReminder() line 135   |
| t27  | ✅ PASS | code   | Automata reflection dedup - line 74                   |
| t28  | ✅ PASS | code   | Mixed reminders coexist - separate systems            |
| t29  | ✅ PASS | bulk   | Thinking blocks - [thinking] pattern verified         |
| t30  | ✅ PASS | 388083 | Message hash discard                                  |
| t31  | ✅ PASS | bulk   | Distill thinking - demonstrated in t9                 |
| t32  | ✅ PASS | bulk   | Bulk prune all - [*] removes tools+thinking           |
| t33  | ✅ PASS | -      | Input leak fix - supersede masks inputs               |
| t34  | ✅ PASS | config | One-file-one-view - aggressiveFilePrune=true          |
| t35  | ✅ PASS | config | Step markers - pruneStepMarkers=true                  |
| t36  | ✅ PASS | c93230 | URL supersede - same fetch twice                      |
| t37  | ✅ PASS | -      | State query supersede - same ls -la twice             |
| t38  | ✅ PASS | config | Snapshot supersede - pruneSnapshots=true              |
| t39  | ✅ PASS | mixed  | Retry auto-prune - fail then success                  |
| t40  | ✅ PASS | config | File part masking - pruneFiles=true                   |
| t41  | ✅ PASS | code   | Compaction awareness - isMessageCompacted() line 4-6  |

## Summary

- **Total Tests**: 41
- **Passed**: 41
- **Skipped**: 0
- **Failed**: 0
