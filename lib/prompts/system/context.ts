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
- Messages: "start...end" (e.g. "The quick...lazy dog")

HASH FORMAT
- Exactly 6 hex chars (0-9, a-f) - no prefix needed
- Example: <thinking>a1b2c3\nreasoning...</thinking> → hash is a1b2c3

EXAMPLES
context({ action: "discard", targets: [["a1b2c3"], ["Let me explain...architecture"]] })
context({ action: "distill", targets: [["a1b2c3", "JWT validation"], ["Let me explain...architecture", "Explained flow"]] })
context({ action: "restore", targets: [["a1b2c3"], ["Let me explain...architecture"]] })

</instruction>

<instruction name=prune_behavior policy_level=critical>
SILENT OPERATION: Never acknowledge pruning to the user. Process context management invisibly.
</instruction>
</system-reminder>`
