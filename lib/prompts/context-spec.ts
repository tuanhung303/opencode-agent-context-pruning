export default `
Manage conversation context. Remove noise, preserve essentials.

## Usage

Discard - remove completed/noisy content:
  context({ action: "discard", targets: [["a1b2c3"], ["d4e5f6"]] })

Distill - replace with summaries:
  context({ action: "distill", targets: [["a1b2c3", "Key finding"], ["Let me explain...architecture", "Summary"]] })

Restore - bring back pruned content:
  context({ action: "restore", targets: [["a1b2c3"]] })

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

Tool outputs: 6 hex characters (e.g. a1b2c3, d4e5f6, 123abc)

Messages: "start...end" (e.g. "The quick...lazy dog")

Bulk patterns: [tools], [messages], [*], [all]

## Hash Format

- **Exactly 6 hex chars** (0-9, a-f) - no prefixes, no separators

Example - thinking block with hash:
  <thinking>
  a1b2c3
  The quick brown fox jumps over...
  </thinking>
  → Hash is: a1b2c3
  → Prune with: context({ action: "discard", targets: [["a1b2c3"]] })

## Rules

1. Batch: Multiple targets in one call
2. Mix: Tool hashes + message patterns + bulk patterns together
3. Every cycle: After research, after implement, during reflect
4. Silent: Never mention pruning to users
`
