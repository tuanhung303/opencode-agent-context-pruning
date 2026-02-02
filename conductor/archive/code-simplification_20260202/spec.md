# Spec: Source Code Simplification & Performance Optimization

## Overview

Comprehensive refactor of the ACP plugin codebase to simplify source code structure and improve runtime performance by applying TypeScript best practices. This refactor targets all core modules while maintaining full backward compatibility and existing functionality.

## Type

Refactor / Chore

## Scope

### Target Modules

| Module             | Path              | Focus                                      |
| ------------------ | ----------------- | ------------------------------------------ |
| Core Utilities     | `lib/*.ts`        | Type safety, utility consolidation         |
| Pruning Strategies | `lib/strategies/` | Algorithm optimization, code deduplication |
| State Management   | `lib/state/`      | Memory efficiency, cleaner interfaces      |
| Configuration      | `lib/config/`     | Schema validation, type inference          |
| Messages           | `lib/messages/`   | Pattern matching optimization              |

## Functional Requirements

### FR-1: TypeScript Best Practices

1. **Discriminated Unions** — Replace type assertions and `instanceof` checks with tagged unions for type-safe branching
2. **Const Assertions & Literal Types** — Use `as const` and literal types for stricter type inference
3. **Generic Constraints** — Add proper generic bounds to improve reusability and type safety
4. **Utility Types** — Leverage `Pick`, `Omit`, `Partial`, `Required`, `Record` to reduce type duplication
5. **Strict Null Checks** — Eliminate `!` non-null assertions, use proper type guards and optional chaining
6. **Function Overloads** — Replace union return types with overloads for better inference at call sites

### FR-2: Performance Optimizations

1. **Reduce Runtime Overhead** — Minimize unnecessary object allocations, loops, and function calls in hot paths (message transformation, strategy execution)
2. **Lazy Initialization** — Defer expensive computations (tokenization, regex compilation) until actually needed
3. **Memoization/Caching** — Cache repeated computations such as token counts and pattern matching results
4. **Reduce Bundle Size** — Eliminate dead code, consolidate duplicate logic, tree-shake unused exports
5. **Improve Iteration Patterns** — Replace `.filter().map()` chains with single-pass transformations where applicable

### FR-3: Code Simplification

1. Consolidate duplicate utility functions across modules
2. Reduce cyclomatic complexity in strategy implementations
3. Extract common patterns into reusable abstractions
4. Simplify conditional logic using discriminated unions

## Non-Functional Requirements

| Requirement            | Target                              |
| ---------------------- | ----------------------------------- |
| Test Coverage          | Maintain ≥80% coverage              |
| Backward Compatibility | No breaking changes to public API   |
| Type Safety            | Zero `any` types in refactored code |
| Build Time             | No significant increase             |

## Acceptance Criteria

- [ ] All existing tests pass without modification (behavioral equivalence)
- [ ] No `!` non-null assertions in refactored modules
- [ ] No `any` types in refactored modules
- [ ] Discriminated unions used for strategy type branching
- [ ] Hot paths (message transform, strategy execution) optimized
- [ ] Memoization applied to token counting operations
- [ ] Single-pass iteration patterns where multiple chained operations existed
- [ ] ESLint and Prettier checks pass
- [ ] TypeScript strict mode remains enabled with no errors

## Out of Scope

- New features or functionality changes
- Changes to the public plugin API
- Configuration schema changes
- Documentation updates (separate track)
- Subagent-related code (disabled by design)
