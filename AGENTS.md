# Agent Guide

> **Critical**: Read [Known Pitfalls](README.md#-known-pitfalls-for-agents) in README before modifying code.

## Quick Reference

| Task             | Resource                                                                             |
| ---------------- | ------------------------------------------------------------------------------------ |
| **Unit Tests**   | `npm run test` — 517 automated vitest tests                                          |
| **E2E Tests**    | `npm test -- tests/e2e/` — 159 tests covering validation scenarios                   |
| **Validation**   | [`docs/VALIDATION_GUIDE.md`](docs/VALIDATION_GUIDE.md) — 43 manual test scenarios    |
| **Architecture** | [`docs/CONTROLLED_CONTEXT_ARCHITECTURE.md`](docs/CONTROLLED_CONTEXT_ARCHITECTURE.md) |
| **Status Bar**   | [`docs/STATUS_BAR_BEHAVIOR.md`](docs/STATUS_BAR_BEHAVIOR.md)                         |
| **Pitfalls**     | [README.md#-known-pitfalls-for-agents](README.md#-known-pitfalls-for-agents)         |

## Testing Commands

| Command                              | What it does                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| `npm run test`                       | Run all automated tests (vitest) — fast, CI-friendly                           |
| `npm test -- tests/e2e/`             | Run E2E tests only — covers VALIDATION_GUIDE scenarios t1-t43                  |
| `make test-e2e`                      | Run E2E tests with XDG isolation                                               |
| `make integration-test`              | Full integration test with opencode CLI                                        |
| "validation tests" / "run checklist" | Execute VALIDATION_GUIDE.md manually — interactive, tests real plugin behavior |
| "integration test"                   | Execute full E2E test flow (see below)                                         |

## E2E Test Coverage (maps to VALIDATION_GUIDE.md)

| Test File                              | Scenarios | Description                                    |
| -------------------------------------- | --------- | ---------------------------------------------- |
| `tests/e2e/core-operations.test.ts`    | t1-t12    | Discard/distill for tools, messages, reasoning |
| `tests/e2e/auto-supersede.test.ts`     | t13-t20   | Hash, file, todo, URL, state query supersede   |
| `tests/e2e/stuck-tasks.test.ts`        | t21-t25   | Stuck task detection and timestamp tracking    |
| `tests/e2e/reminders.test.ts`          | t26-t28   | Reminder deduplication and thresholds          |
| `tests/e2e/thinking-blocks.test.ts`    | t29-t32   | Thinking/reasoning block pruning               |
| `tests/e2e/aggressive-pruning.test.ts` | t33-t43   | One-file-one-view, step markers, snapshots     |

**When user says "validation tests"**:

1. First run `npm test -- tests/e2e/` to verify automated coverage
2. If specific manual testing needed, follow VALIDATION_GUIDE.md step-by-step

**When user says "integration test"**: Execute the full automated test flow:

```bash
# 1. Run unit tests first
npm run test

# 2. Build and link the plugin
npm run build && npm link

# 3. Run E2E tests with XDG isolation
make test-e2e

# 4. (Optional) Run real LLM validation
make test-llm
```

The agent should:

1. Verify all unit tests pass before proceeding
2. Build and link the plugin
3. Run E2E tests that exercise the full plugin pipeline
4. Report pass/fail status with details on any failures
5. Fix any failures before marking complete

## After Code Changes

```bash
npm run build && npm link && opencode
```

---

## 📝 Maintaining This File

**For agents updating AGENTS.md:** Keep entries as one-liners with links. Put detailed content in README.md or dedicated docs, then link here.
