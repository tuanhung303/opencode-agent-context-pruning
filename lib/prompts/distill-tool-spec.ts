export const DISTILL_TOOL_SPEC = `Distills tool outputs into condensed knowledge, then removes raw outputs from context.

## How It Works

Tool outputs are prefixed with hash identifiers like \`r_a1b2c\`. Replace them with summaries.

**Example:**
\`\`\`
r_a1b2c
<file content here...>
\`\`\`

**Syntax:** \`distill([{hash: "r_a1b2c", replace_content: "key findings..."}])\`

## When to Distill

| Use | Don't Use |
|-----|-----------|
| Task complete, preserve key findings | You need precise syntax for editing |
| Valuable info mixed with unnecessary detail | Uncertain (prefer keeping over re-fetching) |

## Format

Array of objects with:
- \`hash\`: Hash string (e.g., "r_a1b2c")
- \`replace_content\`: Condensed summary preserving essentials

## Example

<example_distillation>
distill([
  {hash: "r_a1b2c", replace_content: "auth.ts: validateToken(token: string) -> User|null checks cache first (5min TTL) then OIDC."},
  {hash: "r_d4e5f", replace_content: "user.ts: interface User { id: string; email: string; permissions: ('read'|'write'|'admin')[] }"}
])
</example_distillation>`
