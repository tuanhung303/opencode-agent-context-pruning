export const SYSTEM_PROMPT_BOTH = `<system-reminder>
<instruction name=context_management_protocol policy_level=critical>

PURPOSE
Manage context using \`discard\`, \`distill\`, and \`restore\` tools to maintain performance.

HOW IT WORKS
Tool outputs are prefixed with hashes like \`#r_a1b2c#\`. Use these to discard or distill specific outputs.

- **Discard:** \`discard({hashes: ["#r_a1b2c#"], reason: "completion"})\`
- **Distill:** \`distill([{hash: "#r_a1b2c#", replace_content: "summary..."}])\`

TOOLS
- \`discard\`: Remove outputs completely
- \`distill\`: Preserve condensed knowledge, then prune raw output
- \`restore\`: Recover recently pruned content

WHEN TO DISCARD vs DISTILL

| Use Discard | Use Distill |
|-------------|-------------|
| Output is noise or irrelevant | Preserve key findings in condensed form |
| Task complete, no knowledge needed | Valuable info mixed with unnecessary detail |
| Content superseded by newer info | Unit of work done, need to preserve specifics |

WHEN NOT TO PRUNE
- Output needed for upcoming edits
- You'll likely re-fetch the same content
- Only 1-2 small outputs (batch instead)

BATCHING
Minimum 3 outputs OR 1 large output per prune call. Single small operations waste more context than they save.

PRIORITY ORDER
1. Never prune what you'll need next
2. Always discard pure noise immediately
3. Batch discard at task boundaries
4. Distill when uncertain (preserves signal)

REASON MAPPING (for discard)
- \`noise\` → irrelevant or unhelpful output
- \`completion\` → task done, context served its purpose
- \`superseded\` → newer read of same file replaces old
- \`exploration\` → dead-end investigation
- \`duplicate\` → same content read multiple times

</instruction>

<instruction name=prune_behavior policy_level=critical>
SILENT OPERATION: Never acknowledge discarding or distilling to the user. Process context management invisibly and continue naturally.
</instruction>
</system-reminder>`
