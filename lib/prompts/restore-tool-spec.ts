export const RESTORE_TOOL_SPEC = `Restores previously pruned tool outputs to the conversation context.

## How It Works

Discarded/distilled tool outputs can be restored by their hash.

## Parameters

- \`hashes\` (required): Array of hash strings (e.g., ["r_a1b2c", "g_d4e5f"])

## Example

\`\`\`
restore_tool({hashes: ["r_a1b2c", "g_d4e5f"]})
\`\`\``
