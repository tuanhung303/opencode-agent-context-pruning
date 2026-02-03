export default `
Manage conversation context. Remove noise, preserve essentials.

## Usage

Discard - remove completed/noisy content:
  context({ action: "discard", targets: [["r_a1b2c"], ["g_d4e5f"]] })

Distill - replace with summaries:
  context({ action: "distill", targets: [["r_a1b2c", "Key finding"], ["Let me explain...architecture", "Summary"]] })

Restore - bring back pruned content:
  context({ action: "restore", targets: [["r_a1b2c"]] })

## Bulk Operations

Bulk patterns target ALL eligible items of a type (respects turn/protected tool protection):

Discard all tool outputs:
  context({ action: "discard", targets: [["[tools]"]] })

Discard all assistant messages:
  context({ action: "discard", targets: [["[messages]"]] })

Discard everything eligible:
  context({ action: "discard", targets: [["[*]"]] })
  context({ action: "discard", targets: [["[all]"]] })

Distill all tool outputs with one summary:
  context({ action: "distill", targets: [["[tools]", "Research findings summarized"]] })

Distill all messages:
  context({ action: "distill", targets: [["[messages]", "Previous discussion summarized"]] })

Distill everything:
  context({ action: "distill", targets: [["[*]", "All context summarized"]] })

## Targets

Tool outputs: r_a1b2c (e.g. r_abc12, g_def34, t_56789)

Messages: "start...end" (e.g. "The quick...lazy dog")

Bulk patterns: [tools], [messages], [*], [all]

## Rules

1. Batch: Multiple targets in one call
2. Mix: Tool hashes + message patterns + bulk patterns together
3. Every cycle: After research, after implement, during reflect
4. Silent: Never mention pruning to users
`
