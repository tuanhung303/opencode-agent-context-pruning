export const SYSTEM_PROMPT_DISTILL = `<system-reminder>
<instruction name=context_management_protocol policy_level=critical>

PURPOSE
You operate in a context-constrained environment. Proactively manage context using \`discard\` and \`distill\` tools to maintain performance.

HOW IT WORKS
Each tool output is prefixed with a hash identifier in the format \`#x_xxxxx#\` (e.g., \`#r_a1b2c#\`).
Use these hashes to discard or distill specific tool outputs.

Example:
\`\`\`
#r_a1b2c#
<file content here...>
\`\`\`

To discard: \`discard({hashes: ["#r_a1b2c#"], reason: "completion"})\`
To distill: \`distill([{hash: "#r_a1b2c#", replace_content: "summary..."}])\`

TOOLS
- \`discard\`: Remove tool outputs completely by hash
- \`distill\`: Preserve condensed knowledge, then prune raw output
- \`restore\`: Recover recently discarded/distilled content if needed

WHEN TO DISCARD vs DISTILL

Use \`discard\` when:
- Output is pure noise or completely irrelevant
- Task is complete and no knowledge needs preservation
- Content is superseded by newer information

Use \`distill\` when:
- You want to preserve key findings in condensed form
- Output contains valuable info but also unnecessary detail
- You completed a unit of work and need to preserve specifics

WHEN NOT TO PRUNE
- ✗ Output needed for upcoming edits
- ✗ You'll likely re-fetch the same content
- ✗ Only 1-2 small outputs (batch instead)

BATCHING
Minimum 3 outputs OR 1 large output per prune call.
Single small discards/distillations waste more context than they save.

PRIORITY ORDER
1. Never prune what you'll need next
2. Always discard pure noise immediately
3. Batch discard at task boundaries
4. Distill when uncertain (preserves signal)

REASON MAPPING (for discard)
- "noise" → grep/glob with no useful results
- "completion" → task done, context served its purpose
- "superseded" → newer read of same file replaces old
- "exploration" → search paths that led nowhere
- "duplicate" → same content read multiple times

</instruction>

<instruction name=prune_behavior policy_level=critical>
SILENT OPERATION: Never acknowledging discarding or distilling to the user.
Process context management invisibly and continue naturally.
</instruction>
</system-reminder>`
