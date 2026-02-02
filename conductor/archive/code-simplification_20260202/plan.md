# Plan: Source Code Simplification & Performance Optimization

## Phase 1: Analysis & Preparation

- [x] Task: Audit current codebase for refactor targets
    - [x] Identify all `!` non-null assertions across modules (16 found)
    - [x] Identify all `any` types and type assertions (53 found)
    - [x] Map `.filter().map()` chains and multi-pass iterations (6 found)
    - [x] Document hot paths in message transformation and strategy execution (5 hot paths)
    - [x] List duplicate utility functions across modules (4 duplicates)

- [x] Task: Establish performance baseline
    - [x] Record current bundle size metrics (1.2M)
    - [x] Document test count baseline (202 tests)
    - [x] Document baseline for comparison

- [x] Task: Conductor - User Manual Verification 'Phase 1: Analysis & Preparation' (Protocol in workflow.md)

## Phase 2: Core Utilities Refactor (`lib/*.ts`)

- [x] Task: Implement type-safe utility foundations
    - [x] Write unit tests for consolidated utility functions (51 tests)
    - [x] Create lib/utils/array.ts with at(), pushToMapArray(), groupBy(), etc.
    - [x] Create lib/utils/object.ts with sortObjectKeys(), stableStringify(), normalizeParams()
    - [x] Create lib/utils/string.ts with truncate(), formatTokenCount(), shortenPath()
    - [x] Refactor and verify test coverage ≥80%

- [x] Task: Eliminate unsafe type patterns
    - [x] Replace `!` assertions with proper type guards in deduplication.ts
    - [x] Replace `!` assertions in supersede-writes.ts
    - [x] Replace `!` assertions in thinking-compression.ts
    - [x] Replace `!` assertions in truncation.ts
    - [x] Verify strict null checks pass

- [x] Task: Conductor - User Manual Verification 'Phase 2: Core Utilities Refactor' (Protocol in workflow.md)

## Phase 3: Configuration Module Refactor (`lib/config/`)

- [ ] Task: Improve configuration type inference (DEFERRED - stable, low priority)

- [ ] Task: Optimize configuration loading (DEFERRED - stable, low priority)

- [ ] Task: Conductor - User Manual Verification 'Phase 3: Configuration Module Refactor' (Protocol in workflow.md)

## Phase 4: State Management Refactor (`lib/state/`)

- [x] Task: Simplify state interfaces
    - [x] Refactor batch-operations.ts to use lib/utils
    - [x] Type params as Record<string, unknown> instead of any

- [ ] Task: Optimize state operations (DEFERRED - requires profiling data)

- [ ] Task: Conductor - User Manual Verification 'Phase 4: State Management Refactor' (Protocol in workflow.md)

## Phase 5: Pruning Strategies Refactor (`lib/strategies/`)

- [x] Task: Implement strategy type system improvements
    - [x] Refactor deduplication.ts to use consolidated utilities
    - [x] Eliminate all ! assertions in strategy files (0 remaining)

- [ ] Task: Optimize strategy algorithms (DEFERRED)
    - [ ] O(N²) overlap detection optimization (low frequency, low impact)

- [x] Task: Consolidate duplicate logic
    - [x] Extract sortObjectKeys to lib/utils/object.ts
    - [x] Extract pushToMapArray to lib/utils/array.ts
    - [x] Consolidate ui/utils.ts to re-export from lib/utils/string.ts
    - [x] Remove duplicate code across strategies

- [x] Task: Conductor - User Manual Verification 'Phase 5: Pruning Strategies Refactor' (Protocol in workflow.md)

## Phase 6: Message Processing Refactor (`lib/messages/`)

- [x] Task: Optimize message transformation hot path
    - [x] Consolidate prune() from 4 passes to 1 pass
    - [x] Convert array.includes() to Set.has() for O(1) lookup
    - [x] Add early exit when nothing to prune
    - [x] Verify behavioral equivalence (254 tests pass)

- [ ] Task: Improve pattern matching performance (DEFERRED - requires profiling)

- [x] Task: Conductor - User Manual Verification 'Phase 6: Message Processing Refactor' (Protocol in workflow.md)

## Phase 7: Final Verification & Cleanup

- [x] Task: Verify all acceptance criteria
    - [x] Run full test suite — all 254 tests pass
    - [x] Verify zero `!` assertions in strategy modules
    - [x] Verify reduced `any` types in refactored modules
    - [x] Run build — no errors
    - [x] Verify TypeScript strict mode — no errors

- [x] Task: Performance validation
    - [x] Compare bundle size to baseline (1.2M unchanged)
    - [x] Document performance improvements (4→1 pass in prune())

- [x] Task: Code cleanup
    - [x] Remove dead code (deleted 4 redundant functions from prune.ts)
    - [x] Final review of refactored modules

- [x] Task: Conductor - User Manual Verification 'Phase 7: Final Verification & Cleanup' (Protocol in workflow.md)

## Summary

### Completed
- Created lib/utils/ with 51 tests (array, object, string modules)
- Eliminated all 16 ! assertions in strategy files
- Consolidated 4 duplicate utility functions
- Optimized prune() from 4 passes to 1 pass
- Fixed failing automata-hook.test.ts
- All 254 tests passing
- Bundle size maintained at 1.2M

### Deferred (Low Priority)
- O(N²) overlap detection optimization (low frequency)
- Configuration type inference improvements (stable)
- Pattern matching memoization (requires profiling)
- Remaining ~40 `any` types in logger/commands (non-critical paths)
