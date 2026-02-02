export const DISTILL_MSG_SPEC = `Distills assistant messages into condensed knowledge, then removes raw content.

## How It Works

Uses pattern matching to identify messages, then replaces with summaries.

**Pattern formats:**
- \`start...end\` → text.startsWith(start) && text.endsWith(end)
- \`start...\`    → text.startsWith(start)
- \`...end\`      → text.endsWith(end)
- \`exact\`       → text.includes(exact)

## Format

Array of objects with:
- \`pattern\`: Pattern string to match message
- \`replace_content\`: Condensed summary

## Example

\`\`\`
distill_msg([
  {pattern: "Let me explain...", replace_content: "Explained auth architecture"},
  {pattern: "Here's the plan...", replace_content: "Outlined implementation steps"}
])
\`\`\``
