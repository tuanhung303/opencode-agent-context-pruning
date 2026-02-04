export default `
Manage conversation context. Remove noise, preserve essentials.

## Actions

| Action | Purpose | Format |
|--------|---------|--------|
| discard | Remove content entirely | [["hash"], ...] |
| distill | Replace with summary | [["hash", "summary"], ...] |

## Targets

| Type | Format | Example |
|------|--------|---------|
| Tool output | 6 hex chars | \`a1b2c3\` |
| Message part | 6 hex chars | \`d4e5f6\` |
| Thinking block | 6 hex chars | \`123abc\` |

All hashes are auto-detected from state registry. No prefixes needed.

## High-Value Targets

**Thinking blocks are your largest context consumers** (~2000+ tokens each).

Prune thinking blocks when:
1. Analysis is complete and conclusions are documented
2. Switching to a new task or phase
3. After implementing a plan (reasoning no longer needed)

Prefer \`distill\` over \`discard\` to preserve decision rationale.

## Examples

Discard multiple tools:
  context({ action: "discard", targets: [["a1b2c3"], ["d4e5f6"]] })

Distill a thinking block:
  context({ action: "distill", targets: [["abc123", "Auth: use JWT with 24h expiry"]] })

Mixed targets (tools + thinking):
  context({ action: "discard", targets: [["a1b2c3"], ["def456"]] })

## Distill Best Practices

When distilling thinking blocks, include:
- **What was decided** — the chosen approach
- **Why it was chosen** — key reasoning
- **What was rejected** — failed alternatives (prevents regression loops)

Bad: "Analysis complete"
Good: "Chose JWT over sessions: stateless, scales better. Rejected OAuth: overkill for internal API."

## Rules

1. **Batch** — Multiple targets in one call
2. **Every phase** — Prune after research, analyze, implement
3. **Silent** — Never mention pruning to users

## Hash Format

- Exactly 6 hex characters (0-9, a-f)
- No prefixes, no separators

Example — extracting thinking block hash:
  <thinking>
  The user wants to implement auth...
  <thinking_hash>abc123</thinking_hash>
  </thinking>
  
  → Hash is: abc123
  → Prune: context({ action: "discard", targets: [["abc123"]] })
`
