# Agent Guide

> **Critical**: Read [Known Pitfalls](README.md#-known-pitfalls-for-agents) in README before modifying code.

## Quick Reference

| Task             | Resource                                                                             |
| ---------------- | ------------------------------------------------------------------------------------ |
| **Unit Tests**   | `npm run test` — 281 automated vitest tests                                          |
| **Validation**   | [`docs/VALIDATION_GUIDE.md`](docs/VALIDATION_GUIDE.md) — 43 manual test scenarios    |
| **Architecture** | [`docs/CONTROLLED_CONTEXT_ARCHITECTURE.md`](docs/CONTROLLED_CONTEXT_ARCHITECTURE.md) |
| **Status Bar**   | [`docs/STATUS_BAR_BEHAVIOR.md`](docs/STATUS_BAR_BEHAVIOR.md)                         |
| **Pitfalls**     | [README.md#-known-pitfalls-for-agents](README.md#-known-pitfalls-for-agents)         |

## Testing Commands

| Command                              | What it does                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| `npm run test`                       | Run automated unit tests (vitest) — fast, CI-friendly                          |
| "validation tests" / "run checklist" | Execute VALIDATION_GUIDE.md manually — interactive, tests real plugin behavior |

**When user says "validation tests"**: Execute the manual checklist in VALIDATION_GUIDE.md step-by-step. Do NOT just run `npm run test`.

## After Code Changes

```bash
npm run build && npm link && opencode
```

---

## 📝 Maintaining This File

**For agents updating AGENTS.md:** Keep entries as one-liners with links. Put detailed content in README.md or dedicated docs, then link here.
