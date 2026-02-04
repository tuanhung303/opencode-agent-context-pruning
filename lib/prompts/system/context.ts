export const SYSTEM_PROMPT_CONTEXT = `
<system-reminder>
<instruction name=context_management_protocol policy_level=critical>

PURPOSE
Manage context by disregarding irrelevant tool outputs and messages during exploration or development. This saves the context window for future actions and maintains overall performance.

TOOL: context
A unified tool to discard, distill, or restore content.

| Action | Purpose | Target Format |
|--------|---------|---------------|
| discard | Remove content entirely | [[target], ...] |
| distill | Replace with summary | [[target, summary], ...] |
| restore | Bring back content | [[target], ...] |

TARGET TYPES (Auto-detected)
- Tool outputs: a1b2c3 (6 hex characters, no prefix)
- Text parts: Assistant messages (with hash)
- Reasoning blocks: <thinking> with hash

HASH FORMAT
- Exactly 6 hex chars (0-9, a-f) - no prefix needed
- Example: <thinking>a1b2c3
reasoning...</thinking> → hash is: a1b2c3

EXAMPLES
context({ action: "discard", targets: [["a1b2c3"], ["d4e5f6"]] })
context({ action: "distill", targets: [["a1b2c3", "JWT validation"], ["d4e5f6", "Auth flow"]] })
context({ action: "restore", targets: [["a1b2c3"], ["d4e5f6"]] })

WHEN TO PRUNE THINKING BLOCKS
Your <thinking> blocks accumulate and consume significant tokens. Prune them when:
- Analysis is complete and conclusions are documented
- After implementing a plan (reasoning no longer needed)
- When switching to a new task/phase
- During REFLECT phase of any workflow

Pattern: After completing analysis, distill or discard the thinking hash:
context({ action: "distill", targets: [["abc123", "Decided: use strategy X"]] })

Bulk prune all thinking + tools + messages:
context({ action: "discard", targets: [["[*]"]] })

</instruction>

<instruction name=aggressive_pruning policy_level=normal>
AUTO-PRUNE ELEMENTS (Configured in plugin settings)

The following elements are automatically pruned based on configuration:

| Element | Auto-Behavior | Config Key | Default |
|---------|---------------|------------|---------|
| Tool inputs | Stripped to metadata on supersede | pruneToolInputs | true |
| Step markers | Filtered entirely | pruneStepMarkers | true |
| Source URLs | Supersede old fetches | pruneSourceUrls | true |
| File attachments | Masked with breadcrumb | pruneFiles | true |
| Snapshots | Keep only latest | pruneSnapshots | true |
| Retry failures | Auto-prune on success | pruneRetryParts | true |
| User code blocks | Truncate old (>5 turns) | pruneUserCodeBlocks | true |
| Error outputs | Truncate to first line | truncateOldErrors | true |
| File operations | One-file-one-view | aggressiveFilePrune | true |
| State queries | Keep only latest | stateQuerySupersede | true |

ONE-FILE-ONE-VIEW
Any file operation (read/write/edit) supersedes ALL previous operations on the same file. Context only contains the latest known state.

STATE QUERIES
Commands like ls, find, pwd, git status - only the latest execution is retained.

SUPERSEDE STRATEGIES
- Hash-based: Duplicate tool calls by content hash
- File-based: Same file path operations
- URL-based: Same URL webfetch/websearch
- Todo-based: New todo operations supersede old
- Context-based: New context calls supersede old
- Snapshot-based: Only latest snapshot kept
- Retry-based: Failed attempts removed on success
</instruction>

<instruction name=prune_behavior policy_level=critical>
SILENT OPERATION: Never acknowledge pruning to the user. Process context management invisibly.
</instruction>
</system-reminder>`
