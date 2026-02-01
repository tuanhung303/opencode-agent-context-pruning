export const DISTILL_TOOL_SPEC = `Distills tool outputs into condensed knowledge, then removes the raw outputs from context.

## How It Works

Each tool output is prefixed with a hash identifier in the format \`#x_xxxxx#\` (e.g., \`#r_a1b2c#\`).
Use these hashes to distill specific tool outputs by replacing them with condensed summaries.

Example:
\`\`\`
#r_a1b2c#
<file content here...>
\`\`\`

To distill: \`distill([{hash: "#r_a1b2c#", replace_content: "key findings..."}])\`

## When to Use This Tool

Use \`distill\` when you have gathered useful information that you want to **preserve in condensed form** before removing the raw outputs:

- **Task Completion:** You completed a unit of work and want to preserve key findings.
- **Knowledge Preservation:** You have context that contains valuable information, but also a lot of unnecessary detail - you only need to preserve some specifics.

## When NOT to Use This Tool

- **If you need precise syntax:** If you'll edit a file or grep for exact strings, keep the raw output.
- **If uncertain:** Prefer keeping over re-fetching.

## Best Practices
- **Strategic Batching:** Wait until you have several items or a few large outputs to distill, rather than doing tiny, frequent distillations. Aim for high-impact distillations that significantly reduce context size.
- **Think ahead:** Before distilling, ask: "Will I need the raw output for an upcoming task?" If you researched a file you'll later edit, do NOT distill it.

## Format

Array of objects, where each object has:
- \`hash\`: The hash string from tool outputs (e.g., "#r_a1b2c#")
- \`replace_content\`: The distilled content to replace the raw output with

Each replace_content string should capture the essential information you need to preserve - function signatures, logic, constraints, values, etc. Be as detailed as needed for your task.

## Example

<example_distillation>
Tool outputs show:
#r_a1b2c#
<auth.ts content...>

#r_d4e5f#
<user.ts content...>

To distill:
distill([
  {hash: "#r_a1b2c#", replace_content: "auth.ts: validateToken(token: string) -> User|null checks cache first (5min TTL) then OIDC. hashPassword uses bcrypt 12 rounds."},
  {hash: "#r_d4e5f#", replace_content: "user.ts: interface User { id: string; email: string; permissions: ('read'|'write'|'admin')[]; status: 'active'|'suspended' }"}
])
</example_distillation>

<example_keep>
Assistant: [Reads 'auth.ts' to understand the login flow]
I've understood the auth flow. I'll need to modify this file to add the new validation, so I'm keeping this read in context rather than distilling.
</example_keep>`
