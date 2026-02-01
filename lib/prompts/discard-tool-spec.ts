export const DISCARD_TOOL_SPEC = `Discards tool outputs from context to manage conversation size and reduce noise.

## How It Works

Each tool output is prefixed with a hash identifier in the format \`#x_xxxxx#\` (e.g., \`#r_a1b2c#\`).
Use these hashes to discard specific tool outputs when they are no longer needed.

Example:
\`\`\`
#r_a1b2c#
<file content here...>
\`\`\`

To discard: \`discard({hashes: ["#r_a1b2c#"], reason: "completion"})\`

## When to Use This Tool

Use \`discard\` for removing tool content that is no longer needed:

- **Noise:** Irrelevant, unhelpful, or superseded outputs that provide no value.
- **Task Completion:** Work is complete and there's no valuable information worth preserving.

## When NOT to Use This Tool

- **If the output contains useful information:** Keep it in context rather than discarding.
- **If you'll need the output later:** Don't discard files you plan to edit or context you'll need for implementation.

## Best Practices
- **Strategic Batching:** Don't discard single small tool outputs (like short bash commands) unless they are pure noise. Wait until you have several items to perform high-impact discards.
- **Think ahead:** Before discarding, ask: "Will I need this output for an upcoming task?" If yes, keep it.

## Format

- \`hashes\`: Array of hash strings from tool outputs (e.g., ["#r_a1b2c#", "#g_d4e5f#"])
- \`reason\` (required): Why you're discarding. One of:
  - \`noise\` - Irrelevant or unhelpful output
  - \`completion\` - Task done, no longer needed
  - \`superseded\` - Newer output replaces this
  - \`exploration\` - Dead-end investigation
  - \`duplicate\` - Same content read multiple times

## Example

<example_discard>
Multiple tools to discard after task completion:
discard({hashes: ["#r_a1b2c#", "#g_d4e5f#", "#b_12345#"], reason: "completion"})
</example_discard>

<example_exploration>
After exploring files that weren't useful:
discard({hashes: ["#r_abc12#", "#r_def34#"], reason: "exploration"})
</example_exploration>`
