# Specification: Auto-Pruning Opt-In

## Overview

Change the default behavior of the Agentic Context Pruning (ACP) plugin to disable all automatic pruning strategies by default. Only agentic pruning (explicit discard/distill tools) will be enabled out-of-the-box. Users must explicitly opt-in to auto-pruning via configuration.

## Goals

1. **Agentic-First Approach**: Prioritize explicit agent control over automatic pruning
2. **Safe Defaults**: Prevent unexpected context loss for new users
3. **Clear Opt-In Path**: Make it easy for users to enable auto-pruning when desired
4. **Backward Compatibility**: Existing users can restore old behavior via configuration

## Functional Requirements

### 1. Disabled by Default (Auto Pruning)

The following settings must default to `false`:

| Setting                                  | Current Default | New Default         |
| ---------------------------------------- | --------------- | ------------------- |
| `autoPruneAfterTool`                     | `true`          | `false`             |
| `strategies.deduplication.enabled`       | `true`          | `false`             |
| `strategies.purgeErrors.enabled`         | `true`          | `false`             |
| `strategies.truncation.enabled`          | `true`          | `false`             |
| `strategies.thinkingCompression.enabled` | `true`          | `false`             |
| `strategies.supersedeWrites.enabled`     | `false`         | `false` (no change) |

### 2. Enabled by Default (Agentic Pruning)

The following settings remain enabled:

| Setting                      | Default | Reason                           |
| ---------------------------- | ------- | -------------------------------- |
| `tools.discard.enabled`      | `true`  | Core agentic pruning tool        |
| `tools.distill.enabled`      | `true`  | Core agentic pruning tool        |
| `tools.todoReminder.enabled` | `true`  | Helpful, non-destructive feature |
| `commands.enabled`           | `true`  | User control via slash commands  |
| `enabled` (master switch)    | `true`  | Plugin remains active            |

### 3. Configuration Schema Updates

Update all schema files to reflect new defaults:

- `lib/config/defaults.ts` - Default configuration object
- `lib/config/schema.ts` - Zod schema definitions
- `acp.schema.json` - JSON Schema for IDE autocomplete

### 4. Documentation Updates

#### README.md Changes

1. **Add "Agentic vs Auto Pruning" Section**
    - Clearly explain the two pruning modes
    - Show which is enabled by default
    - Explain the philosophy behind the change

2. **Update Default Configuration Example**
    - Show minimal config with auto-pruning disabled
    - Highlight that only agentic tools are active

3. **Add Opt-In Configuration Example**
    - Provide complete example for enabling all auto-pruning strategies
    - Include all relevant settings
    - Add explanatory comments

### 5. Integration Test

Create an integration test that verifies the plugin behavior:

**Test Scenario**: Agent performs sequential `todowrite` and `echo` operations from 1 to 10

**Purpose**: Verify that:

- Agentic tools work correctly with new defaults
- Context is preserved appropriately
- No unexpected pruning occurs

## Non-Functional Requirements

### Performance

- No performance impact expected (features being disabled, not added)

### Compatibility

- This is a **breaking change** for users relying on auto-pruning
- Users must add configuration to restore old behavior
- Document migration path clearly

### Testing

- All existing tests must pass
- Update test fixtures that assume auto-pruning defaults
- Add new test for opt-in configuration

## Acceptance Criteria

- [ ] `lib/config/defaults.ts` has all auto-pruning strategies disabled by default
- [ ] `lib/config/schema.ts` has all Zod defaults set to `false` for auto-pruning
- [ ] `acp.schema.json` has all JSON schema defaults set to `false` for auto-pruning
- [ ] README.md includes "Agentic vs Auto Pruning" explanation section
- [ ] README.md default config example shows strategies disabled
- [ ] README.md includes opt-in configuration example
- [ ] All unit tests pass
- [ ] Integration test for todo sequence (1-10) is created and passes
- [ ] No TypeScript errors
- [ ] No ESLint errors
- [ ] Code coverage remains > 80%

## Out of Scope

- Changes to agentic tool behavior (discard/distill/restore)
- Changes to protected tools or file patterns
- Changes to turn protection logic
- Changes to notification system
- Changes to slash commands

## Migration Guide (for README)

Users upgrading from previous versions who want to restore auto-pruning behavior should add this to their configuration:

```json
{
    "$schema": "https://raw.githubusercontent.com/tuanhung303/opencode-acp/master/acp.schema.json",
    "autoPruneAfterTool": true,
    "strategies": {
        "deduplication": { "enabled": true },
        "purgeErrors": { "enabled": true, "turns": 4 },
        "truncation": { "enabled": true, "maxTokens": 2000 },
        "thinkingCompression": { "enabled": true, "minTurnsOld": 3 }
    }
}
```
