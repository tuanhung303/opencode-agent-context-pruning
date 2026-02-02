export const DISCARD_TOOL_SPEC = `Removes tool outputs from context to manage conversation size.

## How It Works

Tool outputs are prefixed with hash identifiers like \`r_a1b2c\`. Use these to discard specific outputs.

**Example:**
\`\`\`
r_a1b2c
<file content here...>
\`\`\`

**Syntax:** \`discard({hashes: ["r_a1b2c"], reason: "completion"})\`

## When to Discard

| Use | Don't Use |
|-----|-----------|
| Output is noise or irrelevant | You need the output for upcoming edits |
| Task complete, no knowledge to preserve | You'll likely re-fetch the same content |

## Parameters

- \`hashes\`: Array of hash strings (e.g., ["r_a1b2c", "g_d4e5f"])
- \`reason\` (required): One of: \`noise\`, \`completion\`, \`superseded\`, \`exploration\`, \`duplicate\`

## Example

<example_discard>
discard({hashes: ["r_a1b2c", "g_d4e5f", "b_12345"], reason: "completion"})
</example_discard>`
