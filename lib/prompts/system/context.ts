import CONTEXT_SPEC from "../context-spec"

export const SYSTEM_PROMPT_CONTEXT = `
<system-reminder>
<instruction name=context_management_protocol policy_level=critical>

${CONTEXT_SPEC}

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
