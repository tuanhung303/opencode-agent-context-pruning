# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-01-31

### Breaking Changes

- **Hash-based discard mechanism**: The `discard` and `extract` tools now use hash identifiers instead of numeric IDs
    - Old: `discard({ids: ["0", "2"]})`
    - New: `discard({hashes: ["#r_a1b2c#", "#g_d4e5f#"], reason: "completion"})`
- **Removed deprecated parameters** from `discard` and `extract` tools:
    - `ids` - replaced by `hashes`
    - `tool_filter` - no longer supported
    - `older_than` - no longer supported
    - `all` - no longer supported
- **Removed nudge system**: The following config options have been removed:
    - `tools.settings.nudgeEnabled`
    - `tools.settings.nudgeFrequency`
    - `tools.settings.postUserNudgeEnabled`

### Added

- **Hash injection**: Tool outputs now display a hash prefix (e.g., `#r_a1b2c#`) that can be used directly for discarding
- **Reason parameter**: The `discard` tool now requires a `reason` parameter (`noise`, `completion`, `superseded`, `exploration`, `duplicate`)
- **Discard history tracking**: Per-discard token savings are now tracked in state

### Changed

- **~80-90% reduction in context overhead**: No longer injects `<prunable-tools>` list every turn
- **Simplified prompts**: System prompts updated to reflect hash-based workflow

### Removed

- Nudge prompt files (`lib/prompts/nudge/`)
- `insertPruneToolContext()` function (kept as no-op for backward compatibility)

## [1.2.8] - Previous Release

See git history for changes prior to 2.0.0.
