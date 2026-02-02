# Development Workflow

## Overview

This document defines the standard development workflow for the Agentic Context Pruning (ACP) project.

## Workflow Rules

### 1. Test-Driven Development (TDD)

All features must follow the TDD cycle:

1. **Write Tests First**: Create failing tests that define the expected behavior
2. **Implement Feature**: Write minimal code to make tests pass
3. **Refactor**: Clean up code while keeping tests green

#### Task Structure for TDD

When implementing a feature, break it down into:

```markdown
- [ ] Task: Implement [Feature Name]
    - [ ] Write unit tests for [specific functionality]
    - [ ] Implement the feature to pass tests
    - [ ] Refactor and optimize
    - [ ] Verify test coverage > 80%
```

### 2. Code Coverage Requirements

- **Minimum Coverage**: 80% for all new code
- **Coverage Reports**: Generated automatically via `npm run test`
- **Coverage Gaps**: Must be justified in PR description

### 3. Commit Strategy

**Commit After Each Task**: Every completed task should be committed separately.

#### Commit Message Format

```
[type](scope): Brief description

- Detailed change 1
- Detailed change 2

Refs: [track-id]
```

**Types**:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Build process, dependencies, etc.

**Examples**:

```
feat(config): Disable auto-pruning strategies by default

- Set autoPruneAfterTool to false
- Set all strategy enabled flags to false
- Update schema defaults

Refs: auto-pruning-opt-in_20250202
```

### 4. Git Notes for Task Summaries

Use Git Notes to record detailed task summaries without cluttering commit messages.

#### Adding Notes

```bash
# After committing
git notes add -m "Task: Updated default config values
- Changed autoPruneAfterTool from true to false
- Changed deduplication.enabled from true to false
- All tests passing
- Coverage: 85%" HEAD
```

#### Viewing Notes

```bash
git log --notes
```

### 5. Phase Completion Verification

After completing each phase in a track plan, perform manual verification:

#### Phase Completion Checklist

```markdown
- [ ] Task: Conductor - User Manual Verification '[Phase Name]' (Protocol in workflow.md)
    - [ ] Review all changes against spec.md
    - [ ] Run full test suite: `npm test`
    - [ ] Verify code coverage > 80%
    - [ ] Run linting: `npm run lint`
    - [ ] Run type check: `npm run typecheck`
    - [ ] Check for breaking changes
    - [ ] Update documentation if needed
    - [ ] Commit phase completion
```

### 6. Code Review Process

Before marking a track complete:

1. **Self-Review**: Review your own changes
2. **Test Verification**: Ensure all tests pass
3. **Documentation**: Update relevant documentation
4. **Breaking Changes**: Document any breaking changes

### 7. Integration Testing

For features that require end-to-end validation:

#### Integration Test Requirements

- Create integration tests in `tests/integration/`
- Test real-world scenarios
- Verify plugin behavior with actual OpenCode context

**Example Integration Test**:

```typescript
// tests/integration/todo-sequence.test.ts
describe("Integration: Todo Sequence", () => {
    it("should handle sequential todowrite and echo from 1 to 10", async () => {
        // Test implementation
    })
})
```

## Development Commands

### Standard Development Cycle

```bash
# 1. Install dependencies
npm install

# 2. Run tests (TDD cycle)
npm run test:watch

# 3. Type check
npm run typecheck

# 4. Lint
npm run lint

# 5. Build
npm run build

# 6. Full verification
npm test
```

### Pre-Commit Checklist

- [ ] Tests pass: `npm test`
- [ ] Type checking passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Code formatted: `npm run format`
- [ ] Commit message follows format
- [ ] Git note added for complex changes

## Track Implementation Flow

1. **Read Spec**: Understand requirements from `spec.md`
2. **Review Plan**: Follow tasks in `plan.md`
3. **Implement**: Write tests first, then implementation
4. **Verify**: Run tests, check coverage, lint
5. **Commit**: Commit each task with proper message
6. **Phase Check**: Complete phase verification checklist
7. **Repeat**: Move to next task/phase
8. **Finalize**: Complete final verification and close track

## Breaking Changes

When making breaking changes:

1. Document in CHANGELOG.md
2. Update version number (major for breaking)
3. Provide migration guide
4. Mark deprecated features with `@deprecated` JSDoc

## Emergency Procedures

### Test Failures

If tests fail unexpectedly:

1. Check if failure is related to your changes
2. Run tests in isolation: `npm test -- [test-name]`
3. Debug with: `npm run test:watch -- --reporter=verbose`
4. Fix or update tests as needed

### Build Failures

If build fails:

1. Clean: `npm run clean`
2. Rebuild: `npm run build`
3. Check TypeScript errors: `npm run typecheck`
4. Verify all imports are valid

## Tools and Scripts Reference

| Script               | Purpose                  |
| -------------------- | ------------------------ |
| `npm test`           | Run all tests once       |
| `npm run test:watch` | Run tests in watch mode  |
| `npm run typecheck`  | TypeScript type checking |
| `npm run lint`       | ESLint check             |
| `npm run lint:fix`   | Auto-fix ESLint issues   |
| `npm run format`     | Format with Prettier     |
| `npm run build`      | Compile TypeScript       |
| `npm run dev`        | Development mode         |

## Workflow Customization

This workflow can be customized per project needs. Current settings:

- **Test Coverage**: 80% required
- **Commit Frequency**: After each task
- **Task Recording**: Git notes for detailed summaries
- **Phase Verification**: Manual checklist required
