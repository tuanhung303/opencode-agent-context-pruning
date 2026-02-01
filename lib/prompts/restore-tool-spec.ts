export const RESTORE_TOOL_SPEC = `Restores previously pruned tool outputs to the conversation context.

## How It Works

Discarded/distilled outputs are stored in a soft-prune cache (typically 20 turns). Use \`restore\` to bring back pruned content.

## When to Restore

- Accidentally discarded content you still need
- Need to reference full output of previously pruned tool
- Want to undo a recent discard operation

**Limitations:** Cannot restore content older than cache window or pruned before session started.

## Parameters

- \`hashes\` (required): Array of hash strings (e.g., ["#r_a1b2c#", "#g_d4e5f#"])

## Example

<example_restore>
Restore multiple tools at once:
restore({hashes: ["#r_a1b2c#", "#g_d4e5f#", "#b_12345#"]})
</example_restore>`
