# Agent Guide

## Documentation Map

| Document                                               | Purpose                       |
| ------------------------------------------------------ | ----------------------------- |
| [`docs/VALIDATION_GUIDE.md`](docs/VALIDATION_GUIDE.md) | Test specification (43 tests) |
| [`docs/test_trail.md`](docs/test_trail.md)             | Execution log                 |
| [`docs/test_report_*.md`](docs/)                       | Test reports                  |

## Quick Start

```bash
# 0. For full integration tests:
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

## Verify after any code mofification

```bash
npm run build && npm link && opencode
```

## Status Bar Behavior

**The status summary** (`「 💬 15(7.5K) ▼ + 🧠 8(16K) ▼ + ⚙️ 39(83.1K) ▼ 」`) is **ephemeral**:

See [`docs/STATUS_BAR_BEHAVIOR.md`](docs/STATUS_BAR_BEHAVIOR.md) for full details.
