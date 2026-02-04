# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-02-04

### Breaking Changes

- **Removed 4 unused auto-pruning features**: The following features have been removed:
    - **Truncation**: Head-tail truncation of large tool outputs (replaced by hash-based supersede)
    - **Thinking Compression**: Compression of extended reasoning blocks (replaced by explicit `distill` tool)
    - **Turn Protection**: Prevention of pruning within N recent turns (conflicted with aggressive supersede)
    - **Auto-Prune After Tool**: Automatic strategy execution after each tool (superseded by on-demand pruning)

### Removed

- Strategy files: `lib/strategies/truncation.ts`, `lib/strategies/thinking-compression.ts`
- Config options: `truncation`, `thinkingCompression`, `turnProtection`, `autoPruneAfterTool`
- Stats tracking: `truncation` and `thinkingCompression` counters
- Related tests and display code

### Migration

Users with custom configs should remove these settings from `settings.json`:
```json
{
  "contextPruning.strategies.truncation": null,
  "contextPruning.strategies.thinkingCompression": null,
  "contextPruning.turnProtection": null,
  "contextPruning.autoPruneAfterTool": null
}
```

## [2.9.2] - 2026-02-02

### Fixed

- **Case-insensitive pattern matching**: Message pruning patterns now match regardless of case and ignore extra whitespace/newlines
- **Graceful handling of no-match patterns**: `discard_msg` and `distill_msg` no longer throw errors when no messages match; they return empty notifications instead

## [2.9.1] - 2026-02-02

### Fixed

- **Corrected tool parameter formats in README**: Fixed examples to match actual API:
    - `discard_tool(["r_abc12", "r_def34"])` (was `{hashes: [...]}`)
    - `restore_tool(["r_abc12"])` (was `{hashes: [...]}`)
    - `discard_msg(["pattern"])` (was `{patterns: [...]}`)
    - `restore_msg(["m_abc123"])` (was `{hashes: [...]}`)

## [2.9.0] - 2026-02-02

### Added

- **Agent Auto section in README**: Prominent "Agent Auto" section at the top of README with tool reference table, pattern formats, and usage guidance for LLM agents

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
