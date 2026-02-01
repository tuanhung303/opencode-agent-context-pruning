export const RESTORE_TOOL_SPEC = `Restores previously pruned tool outputs to the conversation context.

## How It Works

When tools are discarded or extracted, their original outputs are stored in a soft-prune cache for a limited time. The restore tool allows you to bring back pruned content if you need it again.

## When to Use This Tool

Use \`restore\` when:
- You accidentally discarded content you still need
- You need to reference the full output of a previously pruned tool
- You want to undo a recent discard operation

## When NOT to Use This Tool

- Content older than the cache window (typically 20 turns) cannot be restored
- Content that was pruned before the current session started cannot be restored

## Parameters

- \`hashes\` (required): Array of hash strings from tool outputs (e.g., ["#r_a1b2c#", "#g_d4e5f#"])

## Example

<example_restore>
You previously discarded:
discard({hashes: ["#r_a1b2c#"], reason: "completion"})

Now you need that content back:
restore({hashes: ["#r_a1b2c#"]})
</example_restore>

<example_batch_restore>
Restore multiple tools at once:
restore({hashes: ["#r_a1b2c#", "#g_d4e5f#", "#b_12345#"]})
</example_batch_restore>`
