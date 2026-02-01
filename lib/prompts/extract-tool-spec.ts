export const EXTRACT_TOOL_SPEC = `Extracts key findings from tool outputs into distilled knowledge, then removes the raw outputs from context.

## How It Works

Each tool output is prefixed with a hash identifier in the format \`#x_xxxxx#\` (e.g., \`#r_a1b2c#\`).
Use these hashes to extract and distill specific tool outputs.

## When to Use This Tool

Use \`extract\` when you have gathered useful information that you want to **preserve in distilled form** before removing the raw outputs:

- **Task Completion:** You completed a unit of work and want to preserve key findings.
- **Knowledge Preservation:** You have context that contains valuable information, but also a lot of unnecessary detail - you only need to preserve some specifics.

## When NOT to Use This Tool

- **If you need precise syntax:** If you'll edit a file or grep for exact strings, keep the raw output.
- **If uncertain:** Prefer keeping over re-fetching.

## Best Practices
- **Strategic Batching:** Wait until you have several items or a few large outputs to extract, rather than doing tiny, frequent extractions. Aim for high-impact extractions that significantly reduce context size.
- **Think ahead:** Before extracting, ask: "Will I need the raw output for an upcoming task?" If you researched a file you'll later edit, do NOT extract it.

## Format

- \`hashes\`: Array of hash strings from tool outputs (e.g., ["#r_a1b2c#", "#r_d4e5f#"])
- \`distillation\`: Array of strings, one per hash (positional: distillation[0] is for hashes[0], etc.)
- \`preserve\` (optional): Set to \`true\` to keep the original tool output after extraction. Default is \`false\` (prunes after extraction).

Each distillation string should capture the essential information you need to preserve - function signatures, logic, constraints, values, etc. Be as detailed as needed for your task.

## Example

<example_extraction>
Tool outputs show:
#r_a1b2c#
<auth.ts content...>

#r_d4e5f#
<user.ts content...>

To extract:
extract({
  hashes: ["#r_a1b2c#", "#r_d4e5f#"],
  distillation: [
    "auth.ts: validateToken(token: string) -> User|null checks cache first (5min TTL) then OIDC. hashPassword uses bcrypt 12 rounds.",
    "user.ts: interface User { id: string; email: string; permissions: ('read'|'write'|'admin')[]; status: 'active'|'suspended' }"
  ]
})
</example_extraction>

<example_keep>
Assistant: [Reads 'auth.ts' to understand the login flow]
I've understood the auth flow. I'll need to modify this file to add the new validation, so I'm keeping this read in context rather than extracting.
</example_keep>`
