# Agent Guide

## Documentation Map

| Document                                               | Purpose                       |
| ------------------------------------------------------ | ----------------------------- |
| [`docs/VALIDATION_GUIDE.md`](docs/VALIDATION_GUIDE.md) | Test specification (43 tests) |
| [`docs/test_trail.md`](docs/test_trail.md)             | Execution log                 |
| [`docs/test_report_*.md`](docs/)                       | Test reports                  |

## Quick Start

```bash
# 1. Load test todos from VALIDATION_GUIDE.md into todowrite()
# 2. Run prep-0 through prep-7
# 3. Execute t1 through t43
# 4. Generate report (report-1 through report-4)
```

## Config Requirements

| Key                   | Value           |
| --------------------- | --------------- |
| `aggressiveFilePrune` | `true`          |
| `pruneStepMarkers`    | `true`          |
| `stuckTaskTurns`      | `12`            |
| `protectedTools`      | includes `task` |

## Verify

```bash
/acp stats
```
