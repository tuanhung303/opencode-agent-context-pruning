export const RESTORE_MSG_SPEC = `Restores previously pruned assistant messages to the conversation context.

## How It Works

Discarded/distilled messages can be restored by their generated hash.

## Parameters

- \`hashes\` (required): Array of message hashes (e.g., ["m_a1b2c3", "m_d4e5f6"])

## Example

\`\`\`
restore_msg({hashes: ["m_a1b2c3", "m_d4e5f6"]})
\`\`\``
