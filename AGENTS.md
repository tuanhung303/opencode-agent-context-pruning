# Agent Guide

> **Critical**: Read [Known Pitfalls](README.md#-known-pitfalls-for-agents) in README before modifying code.

## Quick Reference

| Task             | Resource                                                                             |
| ---------------- | ------------------------------------------------------------------------------------ |
| **Testing**      | [`docs/VALIDATION_GUIDE.md`](docs/VALIDATION_GUIDE.md) — 43 test cases               |
| **Architecture** | [`docs/CONTROLLED_CONTEXT_ARCHITECTURE.md`](docs/CONTROLLED_CONTEXT_ARCHITECTURE.md) |
| **Status Bar**   | [`docs/STATUS_BAR_BEHAVIOR.md`](docs/STATUS_BAR_BEHAVIOR.md)                         |
| **Pitfalls**     | [README.md#-known-pitfalls-for-agents](README.md#-known-pitfalls-for-agents)         |

## After Code Changes

```bash
npm run build && npm link && opencode
```

---

## 📝 Maintaining This File

**For agents updating AGENTS.md:** Keep entries as one-liners with links. Put detailed content in README.md or dedicated docs, then link here.
