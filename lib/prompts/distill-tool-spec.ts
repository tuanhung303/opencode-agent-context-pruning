export const DISTILL_TOOL_SPEC = `Distills tool outputs into condensed knowledge, then removes raw outputs from context.

## How It Works

Tool outputs are prefixed with hash identifiers like \`#r_a1b2c#\`. Replace them with summaries.

**Example:**
\`\`\`
#r_a1b2c#
<file content here...>
\`\`\`

**Syntax:** \`distill([{hash: "#r_a1b2c#", replace_content: "key findings..."}])\`

## When to Distill

| Use | Don't Use |
|-----|-----------|
| Task complete, preserve key findings | You need precise syntax for editing |
| Valuable info mixed with unnecessary detail | Uncertain (prefer keeping over re-fetching) |
| Unit of work done, need to preserve specifics | Only 1-2 small outputs (batch instead) |

## Best Practices

- **Batch:** Wait for several items or large outputs before distilling
- **Think ahead:** Don't distill files you'll edit later

## Format

Array of objects with:
- \`hash\`: Hash string (e.g., "#r_a1b2c#")
- \`replace_content\`: Condensed summary preserving essentials (signatures, logic, constraints)

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
</example_distillation>`
