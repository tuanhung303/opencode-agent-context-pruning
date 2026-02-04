export default `
Manage conversation context. Remove noise, preserve essentials.

## Actions

| Action | Purpose | Format |
|--------|---------|--------|
| discard | Remove content entirely | [["target"], ...] |
| distill | Replace with summary | [["target", "summary"], ...] |

## Targets

| Type | Format | Example |
|------|--------|---------|
| Tool output | 6 hex chars | \`a1b2c3\` |
| Message part | 6 hex chars | \`d4e5f6\` |
| Thinking block | 6 hex chars | \`123abc\` |

All hashes are auto-detected from state registry. No prefixes needed.

## Bulk Patterns

| Pattern | Targets | When to Use |
|---------|---------|-------------|
| \`[tools]\` | All tool outputs | After research/exploration |
| \`[messages]\` | All assistant text parts | Conversation cleanup |
| \`[thinking]\` | All reasoning blocks | After analysis complete |
| \`[*]\` or \`[all]\` | Everything eligible | Phase transitions |

Bulk operations respect turn protection and protected tools list.

## High-Value Targets

**Thinking blocks are your largest context consumers** (~2000+ tokens each).

Prune thinking blocks when:
1. Analysis is complete and conclusions are documented
2. Switching to a new task or phase
3. After implementing a plan (reasoning no longer needed)

Prefer \`distill\` over \`discard\` to preserve decision rationale.

## Examples

Individual discard:
  context({ action: "discard", targets: [["a1b2c3"], ["d4e5f6"]] })

Individual distill:
  context({ action: "distill", targets: [["abc123", "Auth: use JWT with 24h expiry"]] })

Bulk discard tools:
  context({ action: "discard", targets: [["[tools]"]] })

Bulk discard thinking:
  context({ action: "discard", targets: [["[thinking]"]] })

Bulk distill thinking (collapses all to one summary):
  context({ action: "distill", targets: [["[thinking]", "Decided: Strategy A over B due to perf"]] })

Mixed targets:
  context({ action: "discard", targets: [["a1b2c3"], ["[thinking]"]] })

## Standard Operating Procedures

After RESEARCH phase:
  context({ action: "discard", targets: [["[tools]"]] })

After ANALYZE phase:
  context({ action: "distill", targets: [["[thinking]", "Key findings: ..."]] })

After IMPLEMENT phase:
  context({ action: "discard", targets: [["[*]"]] })

During REFLECT:
  Review remaining context, prune stale items

## Distill Best Practices

When distilling thinking blocks, include:
- **What was decided** — the chosen approach
- **Why it was chosen** — key reasoning
- **What was rejected** — failed alternatives (prevents regression loops)

Bad: "Analysis complete"
Good: "Chose JWT over sessions: stateless, scales better. Rejected OAuth: overkill for internal API."

## Rules

1. **Batch** — Multiple targets in one call
2. **Mix** — Combine hashes and bulk patterns freely
3. **Every phase** — Prune after research, analyze, implement
4. **Silent** — Never mention pruning to users

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
