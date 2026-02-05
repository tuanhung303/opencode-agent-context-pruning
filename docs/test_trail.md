# ACP Test Trail Log

**Date**: 2026-02-05
**Agent**: Rei-Agent
**Session**: Validation run in progress

## Execution Log

| Test   | Status  | Hash   | Notes                                                                               |
| ------ | ------- | ------ | ----------------------------------------------------------------------------------- |
| prep-0 | ✅ PASS | -      | TypeScript compiles cleanly                                                         |
| prep-1 | ✅ PASS | -      | test-file.txt, other-file.txt verified                                              |
| prep-2 | ✅ PASS | -      | Config verified: aggressiveFilePrune=true, pruneStepMarkers=true, stuckTaskTurns=12 |
| prep-3 | ✅ PASS | 825138 | package.json readable                                                               |
| prep-4 | ✅ PASS | -      | protectedTools verified                                                             |
| prep-5 | ✅ PASS | -      | test_trail.md created                                                               |
| t1     | ✅ PASS | 825138 | Discard tool hash confirmed                                                         |
| t2     | ✅ PASS | -      | Discard message hash confirmed                                                      |
| t3     | ✅ PASS | -      | Mixed discard confirmed                                                             |
| t4     | ✅ PASS | d9a0cd | Distill with summary confirmed                                                      |
| t5     | ✅ PASS | 03732e | Distill message (failed/corrected) confirmed                                        |
| t11    | ✅ PASS | -      | Protected tools exclusion verified                                                  |
| t12    | ✅ PASS | -      | Graceful error handling verified                                                    |
| t13    | ✅ PASS | 825138 | Hash-based supersede confirmed                                                      |
| t14    | ✅ PASS | -      | File-based supersede write confirmed                                                |
| t15    | ✅ PASS | -      | File-based supersede edit confirmed                                                 |
| t16    | ✅ PASS | -      | Todo-based supersede confirmed                                                      |
| t17    | ✅ PASS | -      | Todoread supersede confirmed                                                        |
| t18    | ✅ PASS | -      | No cross-file supersede confirmed                                                   |
| t19    | ✅ PASS | -      | No protected tool supersede confirmed                                               |
| t20    | ✅ PASS | -      | Combined stats verified via stats command                                           |
| t21    | ✅ PASS | -      | Stuck task detection simulated (12 turns)                                           |
