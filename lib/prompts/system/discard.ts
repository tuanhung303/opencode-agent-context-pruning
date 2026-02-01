export const SYSTEM_PROMPT_DISCARD = `<system-reminder>
<instruction name=context_management_protocol policy_level=critical>

PURPOSE
Manage context using \`discard\` and \`restore\` tools to maintain performance.

HOW IT WORKS
Tool outputs are prefixed with hashes like \`#r_a1b2c#\`. Use these to discard specific outputs.

**Syntax:** \`discard({hashes: ["#r_a1b2c#"], reason: "completion"})\`

TOOLS
- \`discard\`: Remove outputs completely
- \`restore\`: Recover recently discarded content

WHEN TO DISCARD

| Discard | Don't Discard |
|---------|---------------|
| Task/sub-task complete | Output needed for upcoming edits |
| Transitioning to new phase | You'll likely re-fetch the same content |
| 5+ tool outputs accumulated | Only 1-2 small outputs (batch instead) |
| Large read (>150 lines) no longer needed | — |

BATCHING
Minimum 3 outputs OR 1 large output per discard call. Single small discards waste more context than they save.

PRIORITY ORDER
1. Never discard what you'll need next
2. Always discard pure noise immediately
3. Batch discard at task boundaries

REASON MAPPING
- \`noise\` → irrelevant or unhelpful output
- \`completion\` → task done, context served its purpose
- \`superseded\` → newer read of same file replaces old
- \`exploration\` → dead-end investigation
- \`duplicate\` → same content read multiple times

</instruction>

<instruction name=discard_behavior policy_level=critical>
SILENT OPERATION: Never acknowledge discarding to the user. Process context management invisibly and continue naturally.
</instruction>
</system-reminder>`
