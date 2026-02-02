# Plan: Interactive Pruning Status Display

## Phase 1: Core Display Formatting

- [ ] Task: Implement pruned tools formatter
    - [ ] Write unit tests for `formatPrunedTools()` function
        - Test single tool: `pruned: read`
        - Test exactly 3 tools: `pruned: read, grep, glob`
        - Test overflow (>3): `pruned: read, grep, glob...`
        - Test empty array: returns empty string
    - [ ] Implement `formatPrunedTools()` in `lib/ui/`
    - [ ] Refactor and verify test coverage > 80%

- [ ] Task: Implement distilled content formatter
    - [ ] Write unit tests for `formatDistilledContent()` function
        - Test content preview: first 5 + `...` + last 5 chars
        - Test short content (<10 chars): show full content
        - Test exactly 3 items with previews
        - Test overflow (>3): append `...`
        - Test empty array: returns empty string
    - [ ] Implement `formatDistilledContent()` in `lib/ui/`
    - [ ] Refactor and verify test coverage > 80%

- [ ] Task: Implement combined display formatter
    - [ ] Write unit tests for `formatPruningStatus()` function
        - Test pruned only
        - Test distilled only
        - Test combined with `|` separator
        - Test both empty: returns empty string
    - [ ] Implement `formatPruningStatus()` in `lib/ui/`
    - [ ] Refactor and verify test coverage > 80%

- [ ] Task: Conductor - User Manual Verification 'Phase 1: Core Display Formatting' (Protocol in workflow.md)

## Phase 2: Notification Integration

- [ ] Task: Implement ANSI color styling
    - [ ] Write unit tests for dim/muted color wrapper
        - Test color application
        - Test graceful fallback (NO_COLOR env, non-TTY)
    - [ ] Implement `dimText()` utility in `lib/ui/`
    - [ ] Refactor and verify test coverage > 80%

- [ ] Task: Integrate with discard_tool notification
    - [ ] Write integration tests for discard notification trigger
    - [ ] Hook `formatPruningStatus()` into `discard_tool` execution path
    - [ ] Verify notification appears after discard operations
    - [ ] Refactor and verify test coverage > 80%

- [ ] Task: Integrate with distill_tool notification
    - [ ] Write integration tests for distill notification trigger
    - [ ] Hook `formatPruningStatus()` into `distill_tool` execution path
    - [ ] Verify notification appears after distill operations
    - [ ] Refactor and verify test coverage > 80%

- [ ] Task: Conductor - User Manual Verification 'Phase 2: Notification Integration' (Protocol in workflow.md)

## Phase 3: Edge Cases & Polish

- [ ] Task: Handle combined operations
    - [ ] Write tests for simultaneous prune + distill in single action
    - [ ] Implement combined notification logic
    - [ ] Verify `|` separator format works correctly

- [ ] Task: Terminal compatibility
    - [ ] Write tests for NO_COLOR environment variable
    - [ ] Write tests for non-TTY output streams
    - [ ] Implement graceful fallback (plain text without ANSI codes)
    - [ ] Verify on different terminal emulators

- [ ] Task: Conductor - User Manual Verification 'Phase 3: Edge Cases & Polish' (Protocol in workflow.md)

## Phase 4: Final Verification

- [ ] Task: End-to-end testing
    - [ ] Manual test: trigger discard_tool, verify notification
    - [ ] Manual test: trigger distill_tool, verify notification
    - [ ] Manual test: verify overflow indicator with >3 items
    - [ ] Verify dim styling is visible but non-intrusive

- [ ] Task: Documentation
    - [ ] Update README or docs with new notification behavior
    - [ ] Add inline code comments for formatter functions

- [ ] Task: Conductor - User Manual Verification 'Phase 4: Final Verification' (Protocol in workflow.md)
