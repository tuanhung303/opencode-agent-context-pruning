# Automata Mode Specification

## Overview

Automata Mode is an autonomous reflection mechanism that injects periodic user messages prompting the AI agent to reflect on its current progress, discover new objectives, and continuously improve the project. This feature extends the existing message injection pattern (similar to todo reminder) but focuses on higher-level strategic reflection rather than task tracking.

## Activation

- **Trigger Keyword**: The mode activates only when the user's prompt contains the term "automata" (case-insensitive)
- **Turn-Based Injection**: Once activated, reflection messages are injected after N turns of continuous work

## Functional Requirements

### FR-1: Activation Detection

- Scan user messages for the "automata" keyword to enable the mode
- Store activation state in session state
- Mode remains active for the duration of the session once triggered

### FR-2: Reflection Message Injection

The injected message must prompt the agent to:

1. **Review Progress**: Assess current progress and identify gaps in the plan
2. **Discover Objectives**: Proactively find new objectives to improve the project
3. **Re-prioritize**: Re-order existing tasks based on new context and discoveries
4. **Suggest Optimizations**: Identify refactoring or optimization opportunities in the codebase

### FR-3: Message Removal

Two removal triggers:

1. **Replace Pattern**: When a new reflection message is injected, remove the previous one (only one reflection message exists at a time)
2. **Action Acknowledgment**: When the agent acts on the reflection (calls `todowrite`), remove the reflection message

### FR-4: Execution Order

- Automata reflection injection MUST execute AFTER todo reminder injection in the `chat.message.transform` hook
- Order: Todo Reminder → Automata Reflection
- This ensures tactical task reminders precede strategic reflection prompts

## Configuration

```typescript
automataMode: {
    enabled: boolean // Default: true
    initialTurns: number // Default: 8 (turns before first reflection)
}
```

## Integration Points

- **Hook**: `chat.message.transform` (existing)
- **State Tracking**: New fields in `SessionState`:
    - `automataEnabled: boolean`
    - `lastAutomataTurn: number`
    - `lastReflectionTurn: number`

## Acceptance Criteria

- [ ] Automata mode activates only when "automata" keyword is present in user prompt
- [ ] Reflection message injects after configured number of turns
- [ ] Previous reflection message is removed when new one is injected
- [ ] Reflection message is removed when agent calls `todowrite`
- [ ] Automata injection executes AFTER todo reminder injection
- [ ] Configuration options are exposed and validated via schema

## Out of Scope

- Custom reflection prompt templates (future enhancement)
- Multiple trigger keywords
- Cross-session automata state persistence
- Integration with subagents
