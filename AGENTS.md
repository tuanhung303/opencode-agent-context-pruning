# Agent Testing Guide

## Overview

This repository contains automated validation tests for the unified `context` tool - a pruning system that replaces 6 separate tools with 1 unified interface supporting advanced pattern matching.

## Test Documentation

**Primary Test Specification**: [`docs/VALIDATION_GUIDE.md`](docs/VALIDATION_GUIDE.md)

Contains 45 comprehensive tests covering:

- Core context tool operations (discard, distill, restore)
- Auto-supersede functionality
- Stuck task detection
- Reminder deduplication
- Thinking block & message pruning
- Aggressive pruning features

## Quick Start

1. **Read the full test spec**: Start with [`docs/test_prompt.md`](docs/test_prompt.md)
2. **Complete preparation tasks**: Run items `prep-1` through `prep-9` first
3. **Execute tests**: Follow the numbered test sequence `t1` through `t45`
4. **Generate report**: Complete post-test tasks `report-1` through `report-4`

## Critical Pre-Test Requirements

Before running any tests, verify:

| Requirement      | Verification Command                                                           |
| ---------------- | ------------------------------------------------------------------------------ |
| Plugin active    | `/acp stats`                                                                   |
| Config correct   | Check `aggressiveFilePrune=true`, `pruneStepMarkers=true`, `stuckTaskTurns=12` |
| Test files exist | `read({ filePath: "test-file.txt" })`                                          |
| Protected tools  | Verify `task` is in `protectedTools`                                           |

## Test Execution

Copy the full todo list from `docs/test_prompt.md` section "Executable Todo List for Agents" into `todowrite()` to track progress.

## Trail Files

Maintain these files during execution:

- `docs/test_trail.md` — Master execution log
- `docs/test_checkpoint_{N}.md` — State snapshots (every 10 tests)
- `docs/test_failures.md` — Failure analysis
- `docs/test_report_{timestamp}.md` — Final report

## Need Help?

Refer to the detailed preparation section in [`docs/test_prompt.md`](docs/test_prompt.md) for:

- Hash capture protocols
- Turn-based testing methodology
- Re-evaluation procedures
- Failure recovery protocols
