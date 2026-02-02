export const SYSTEM_PROMPT_DISTILL = `\u003csystem-reminder\u003e
\u003cinstruction name=context_management_protocol policy_level=critical\u003e

PURPOSE
Manage context using distill tools to maintain performance.

TOOLS
| Tool | Target | Identification |
|------|--------|----------------|
| discard_tool | Tool outputs | Hash: r_a1b2c |
| discard_msg | Assistant messages | Pattern: "start...end" |
| distill_tool | Tool outputs | Hash: r_a1b2c |
| distill_msg | Assistant messages | Pattern: "start...end" |
| restore_tool | Tool outputs | Hash: r_a1b2c |
| restore_msg | Assistant messages | Hash: m_a1b2c3 |

PATTERN MATCHING
- "start...end" → text.startsWith(start) \u0026\u0026 text.endsWith(end)
- "start..." → text.startsWith(start)
- "...end" → text.endsWith(end)
- "exact" → text.includes(exact)

EXAMPLES
discard_tool({hashes: ["r_a1b2c"]})
distill_tool([{hash: "r_a1b2c", replace_content: "auth.ts: validateToken()..."}])
distill_msg([{pattern: "Let me explain...", replace_content: "Explained auth"}])
restore_tool({hashes: ["r_a1b2c"]})

\u003c/instruction\u003e

\u003cinstruction name=prune_behavior policy_level=critical\u003e
SILENT OPERATION: Never acknowledging distilling to the user.
\u003c/instruction\u003e
\u003c/system-reminder\u003e`
