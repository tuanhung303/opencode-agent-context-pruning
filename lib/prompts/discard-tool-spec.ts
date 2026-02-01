export const DISCARD_TOOL_SPEC = `Removes tool outputs from context to manage conversation size.

## How It Works

Tool outputs are prefixed with hash identifiers like \`#r_a1b2c#\`. Use these to discard specific outputs.

**Example:**
\`\`\`
#r_a1b2c#
<file content here...>
\`\`\`

**Syntax:** \`discard({hashes: ["#r_a1b2c#"], reason: "completion"})\`

## When to Discard

| Use | Don't Use |
|-----|-----------|
| Output is noise or irrelevant | You need the output for upcoming edits |
| Task complete, no knowledge to preserve | You'll likely re-fetch the same content |
| Content superseded by newer info | Only 1-2 small outputs (batch instead) |

## Best Practices

- **Batch:** Wait for 3+ outputs or 1 large output before discarding
- **Think ahead:** Ask "Will I need this for upcoming tasks?" before discarding

## Parameters

- \`hashes\`: Array of hash strings (e.g., ["#r_a1b2c#", "#g_d4e5f#"])
- \`reason\` (required): One of:
  - \`noise\` — irrelevant or unhelpful output
  - \`completion\` — task done, no longer needed
  - \`superseded\` — newer output replaces this
  - \`exploration\` — dead-end investigation
  - \`duplicate\` — same content read multiple times

## Example

<example_discard>
Multiple tools to discard after task completion:
discard({hashes: ["#r_a1b2c#", "#g_d4e5f#", "#b_12345#"], reason: "completion"})
</example_discard>`
