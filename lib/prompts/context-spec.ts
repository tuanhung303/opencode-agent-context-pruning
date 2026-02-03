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

Tool outputs: Hash format r_a1b2c
  Examples: r_abc12 (read), g_def34 (glob), t_56789 (task)

Messages: Pattern format "start...end"
  Examples: "Let me explain...architecture" (starts with "Let me explain", ends with "architecture")

## Rules

1. Batch: Multiple targets in one call
2. Mix: Tool hashes + message patterns together
3. Every cycle: After research, after implement, during reflect
4. Silent: Never mention pruning to users
`
