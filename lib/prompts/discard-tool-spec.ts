export const DISCARD_TOOL_SPEC = `Removes tool outputs from context to manage conversation size.

## How It Works

Tool outputs are prefixed with hash identifiers like \`r_a1b2c\`. Use these to discard specific outputs.

**Example:**
\`\`\`
r_a1b2c
<file content here...>
\`\`\`

**Syntax:** \`discard_tool({hashes: ["r_a1b2c"]})\`

## Parameters

- \`hashes\`: Array of hash strings (e.g., ["r_a1b2c", "g_d4e5f"])

## Example

\`\`\`
discard_tool({hashes: ["r_a1b2c", "g_d4e5f"]})
\`\`\``
