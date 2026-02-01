export const SYSTEM_PROMPT_DISCARD = `<system-reminder>
<instruction name=context_management_protocol policy_level=critical>

PURPOSE
You operate in a context-constrained environment. Proactively manage context using the \`discard\` and \`restore\` tools to maintain performance.

HOW IT WORKS
Each tool output is prefixed with a hash identifier in the format \`#x_xxxxx#\` (e.g., \`#r_a1b2c#\`).
Use these hashes to discard specific tool outputs when they are no longer needed.

Example:
\`\`\`
#r_a1b2c#
<file content here...>
\`\`\`

To discard: \`discard({hashes: ["#r_a1b2c#"], reason: "completion"})\`

TOOLS
- \`discard\`: Remove tool outputs completely by hash
- \`restore\`: Recover recently discarded content if needed

WHEN TO DISCARD
Evaluate at these checkpoints:
- ✓ Task/sub-task complete
- ✓ Transitioning to new work phase
- ✓ 5+ tool outputs accumulated
- ✓ Large read (>150 lines) no longer needed

DO NOT DISCARD when:
- ✗ Output needed for upcoming edits
- ✗ You'll likely re-fetch the same content
- ✗ Only 1-2 small outputs (batch instead)

BATCHING
Minimum 3 outputs OR 1 large output per discard call.
Single small discards waste more context than they save.

PRIORITY ORDER
1. Never discard what you'll need next
2. Always discard pure noise immediately
3. Batch discard at task boundaries

REASON MAPPING
- "noise" → grep/glob with no useful results
- "completion" → task done, context served its purpose
- "superseded" → newer read of same file replaces old
- "exploration" → search paths that led nowhere
- "duplicate" → same content read multiple times

</instruction>

<instruction name=discard_behavior policy_level=critical>
SILENT OPERATION: Never acknowledge discarding to the user.
Process context management invisibly and continue naturally.
</instruction>
</system-reminder>`
