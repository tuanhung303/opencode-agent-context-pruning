# Spec: Interactive Pruning Status Display

## Overview

Add a terminal UI (TUI) notification system that provides immediate visual feedback when context pruning occurs. The display shows recent pruning activity in a compact, non-intrusive format directly in the terminal after each pruning action.

## Functional Requirements

### FR-1: Inline Notification Display

- Display a brief inline notification immediately after each pruning action (discard or distill)
- Notification appears in the terminal output stream, not in a persistent status bar

### FR-2: Pruned Tools Format

- Format: `pruned: <tool1>, <tool2>, <tool3>...`
- Show up to 3 tool names (e.g., `read`, `grep`, `glob`, `bash`)
- Append `...` if more than 3 tools were pruned in the action
- Example: `pruned: read, grep, glob...`

### FR-3: Distilled Tools Format

- Format: `distilled: <preview1>, <preview2>, <preview3>...`
- Each preview shows first 5 characters + `...` + last 5 characters of the **content** (not hash)
- Append `...` if more than 3 tools were distilled in the action
- Example: `distilled: auth....token, user....perms...`

### FR-4: Combined Display

- When both pruning and distilling occur in the same action, show both on the same line separated by `|`
- Example: `pruned: read, grep | distilled: auth....token`

### FR-5: Color Scheme

- Use muted/dim gray ANSI color codes for the entire notification
- Ensures subtlety and non-intrusiveness while remaining visible
- Must respect terminal color support (graceful fallback for no-color terminals)

## Non-Functional Requirements

### NFR-1: Performance

- Notification rendering must not block or delay the main pruning operation
- Minimal memory footprint for tracking recent activity

### NFR-2: Compatibility

- Must work with OpenCode's existing notification/UI system in `lib/ui/`
- Must handle terminals without color support gracefully

## Acceptance Criteria

- [ ] Inline notification appears after each `discard_tool` call showing pruned tool names
- [ ] Inline notification appears after each `distill_tool` call showing content previews
- [ ] Maximum 3 items displayed per category with `...` overflow indicator
- [ ] Combined format works when both operations occur together
- [ ] Notification uses dim/muted ANSI styling
- [ ] Graceful fallback when terminal doesn't support colors
- [ ] Unit tests cover all display format variations

## Out of Scope

- Persistent status bar or panel display
- Token savings calculation or display
- Session-level aggregation or history
- Configurable display limits (hardcoded to 3)
- Slash command to query pruning history
