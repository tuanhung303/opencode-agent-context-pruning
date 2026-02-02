# Automata Mode Implementation Plan

## Phase 1: Foundation

- [ ] Task: Add Automata Mode configuration schema
    - [ ] Add `automataMode` section to config schema in `lib/config/schema.ts`
    - [ ] Define `enabled` (boolean, default: true) and `initialTurns` (number, default: 8)
    - [ ] Update JSON schema (`acp.schema.json`) for validation
    - [ ] Verify schema compiles without errors

- [ ] Task: Add Automata state fields to SessionState
    - [ ] Add `automataEnabled: boolean` field
    - [ ] Add `lastAutomataTurn: number` field
    - [ ] Add `lastReflectionTurn: number` field
    - [ ] Update state initialization in `lib/state/`

- [ ] Task: Conductor - User Manual Verification 'Phase 1: Foundation' (Protocol in workflow.md)

## Phase 2: Core Implementation

- [ ] Task: Implement activation detection
    - [ ] Write unit tests for keyword detection ("automata" case-insensitive)
    - [ ] Implement `detectAutomataActivation` function in `lib/messages/automata-mode.ts`
    - [ ] Test activation persists for session duration
    - [ ] Verify tests pass

- [ ] Task: Implement reflection message injection
    - [ ] Write unit tests for `injectAutomataReflection` function
    - [ ] Create reflection message template with 4 prompt areas (progress, objectives, re-prioritize, optimize)
    - [ ] Implement turn-based trigger logic (initialTurns threshold)
    - [ ] Verify tests pass

- [ ] Task: Implement message removal logic
    - [ ] Write unit tests for `removeAutomataReflection` function
    - [ ] Implement replace pattern (remove old when injecting new)
    - [ ] Implement removal on `todowrite` action
    - [ ] Verify tests pass

- [ ] Task: Conductor - User Manual Verification 'Phase 2: Core Implementation' (Protocol in workflow.md)

## Phase 3: Integration

- [ ] Task: Integrate into chat.message.transform hook
    - [ ] Write integration tests for hook execution order
    - [ ] Add `injectAutomataReflection` call AFTER `injectTodoReminder` in `lib/hooks.ts`
    - [ ] Wire activation detection to scan incoming messages
    - [ ] Verify execution order: Todo Reminder → Automata Reflection

- [ ] Task: Integrate removal with todowrite tracking
    - [ ] Update `trackTodoInteractions` in `lib/state/tool-cache.ts`
    - [ ] Call `removeAutomataReflection` when `todowrite` is detected
    - [ ] Verify removal triggers correctly

- [ ] Task: Conductor - User Manual Verification 'Phase 3: Integration' (Protocol in workflow.md)

## Phase 4: Verification & Documentation

- [ ] Task: End-to-end testing
    - [ ] Test full flow: activation → injection → removal
    - [ ] Test edge cases (no automata keyword, disabled config)
    - [ ] Verify no interference with existing todo reminder
    - [ ] Run full test suite: `npm test`

- [ ] Task: Update documentation
    - [ ] Add Automata Mode section to README or docs
    - [ ] Document configuration options
    - [ ] Provide usage examples

- [ ] Task: Conductor - User Manual Verification 'Phase 4: Verification & Documentation' (Protocol in workflow.md)
