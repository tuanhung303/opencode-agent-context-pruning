export const DISCARD_MSG_SPEC = `Removes assistant messages from context to manage conversation size.

## How It Works

Uses pattern matching to identify and discard assistant message parts.

**Pattern formats:**
- \`start...end\` → text.startsWith(start) && text.endsWith(end)
- \`start...\`    → text.startsWith(start)
- \`...end\`      → text.endsWith(end)
- \`exact\`       → text.includes(exact)

## Parameters

- \`patterns\`: Array of pattern strings (e.g., ["Let me explain...breakdown", "Here's the plan..."])

## Example

\`\`\`
discard_msg({patterns: ["Let me explain...breakdown"]})
\`\`\``
