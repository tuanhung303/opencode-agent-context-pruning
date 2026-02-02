export const DISTILL_TOOL_SPEC = `Distills tool outputs into condensed knowledge, then removes raw outputs.

## How It Works

Tool outputs are prefixed with hash identifiers like \`r_a1b2c\`. Replace them with summaries.

**Example:**
\`\`\`
r_a1b2c
<file content here...>
\`\`\`

**Syntax:** \`distill_tool([{hash: "r_a1b2c", replace_content: "key findings..."}])\`

## Format

Array of objects with:
- \`hash\`: Hash string (e.g., "r_a1b2c")
- \`replace_content\`: Condensed summary

## Example

\`\`\`
distill_tool([
  {hash: "r_a1b2c", replace_content: "auth.ts: validateToken() checks JWT..."},
  {hash: "r_d4e5f", replace_content: "user.ts: interface User { id, email, permissions }"}
])
\`\`\``
