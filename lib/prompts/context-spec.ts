export default `
Manage conversation context. Remove noise, preserve essentials.

## Usage

Discard - remove completed/noisy content:
  context({ action: "discard", targets: [["r_a1b2c"], ["g_d4e5f"]] })

Distill - replace with summaries:
  context({ action: "distill", targets: [["r_a1b2c", "Key finding"], ["Let me explain...architecture", "Summary"]] })

Restore - bring back pruned content:
  context({ action: "restore", targets: [["r_a1b2c"]] })

## Targets

Tool outputs: r_a1b2c (e.g. r_abc12, g_def34, t_56789)

Messages: "start...end" (e.g. "The quick...lazy dog")

## Rules

1. Batch: Multiple targets in one call
2. Mix: Tool hashes + message patterns together
3. Every cycle: After research, after implement, during reflect
4. Silent: Never mention pruning to users
`
