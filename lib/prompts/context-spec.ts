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

## Hash Types

| Tag | Where It Appears | Example |
|-----|------------------|---------|
| \`<tool_hash>\` | End of tool outputs (read, bash, glob, grep) | \`<tool_hash>a1b2c3</tool_hash>\` |
| \`<message_hash>\` | End of assistant text messages | \`<message_hash>d4e5f6</message_hash>\` |
| \`<reasoning_hash>\` | End of thinking/reasoning blocks | \`<reasoning_hash>abc123</reasoning_hash>\` |

## High-Value Targets

**Thinking blocks are your largest context consumers** (~2000+ tokens each).

Prune thinking blocks when:
1. Analysis is complete and conclusions are documented
2. Switching to a new task or phase
3. After implementing a plan (reasoning no longer needed)

Prefer \`distill\` over \`discard\` to preserve decision rationale.

## Examples

Discard multiple tools:
  agent_context_optimize({ action: "discard", targets: [["a1b2c3"], ["d4e5f6"]] })

Distill a thinking block:
  agent_context_optimize({ action: "distill", targets: [["abc123", "Auth: use JWT with 24h expiry"]] })

Mixed targets (tools + thinking):
  agent_context_optimize({ action: "discard", targets: [["a1b2c3"], ["def456"]] })

## Distill Best Practices

When distilling thinking blocks, include:
- **What was decided** — the chosen approach
- **Why it was chosen** — key reasoning
- **What was rejected** — failed alternatives (prevents regression loops)

Bad: "Analysis complete"
Good: "Chose JWT over sessions: stateless, scales better. Rejected OAuth: overkill for internal API."

## Auto-Conversion (Thinking Mode)

When thinking mode is enabled, discarding reasoning blocks auto-converts to distill:

\`\`\`
agent_context_optimize({ action: "discard", targets: [["abc123"]] })  // reasoning block
→ Auto-converts to: distill with "—" placeholder
\`\`\`

**Why?** Thinking mode APIs require \`reasoning_content\` to exist on assistant messages. Discarding would remove it entirely, causing API errors. Distilling with "—" preserves the field while minimizing tokens.

## Rules

1. **Batch** — Multiple targets in one call
2. **Every phase** — Prune after research, analyze, implement
3. **Silent** — Never mention pruning to users

## Batching Guidance

Batch multiple targets in a single call for efficiency:

**When to batch:**
- After completing a phase (research, implement, test)
- When multiple related outputs are no longer needed
- To reduce tool call overhead

**Examples:**

Batch discard after research:
\`\`\`
agent_context_optimize({ action: "discard", targets: [["a1b2c3"], ["d4e5f6"], ["g7h8i9"]] })
\`\`\`

Batch distill with summaries:
\`\`\`
agent_context_optimize({ action: "distill", targets: [
  ["abc123", "Auth: chose JWT, rejected sessions"],
  ["def456", "DB: chose PostgreSQL, rejected MongoDB"]
] })
\`\`\`

Mixed batch (tools + reasoning):
\`\`\`
agent_context_optimize({ action: "discard", targets: [
  ["a1b2c3"],  // tool output
  ["d4e5f6"],  // another tool
  ["abc123"]   // reasoning block (auto-converts to distill)
] })
\`\`\`

## Workflow Examples

### Research Phase
After finding target files, discard exploratory searches:
\`\`\`
// Found the auth module after several searches
agent_context_optimize({ action: "discard", targets: [["a1b2c3"], ["d4e5f6"]] })  // old glob/grep outputs
\`\`\`

### Implementation Phase
After successful edit, discard failed attempts:
\`\`\`
// Edit succeeded on 3rd try
agent_context_optimize({ action: "discard", targets: [["abc123"], ["def456"]] })  // failed edit outputs
\`\`\`

### Debug Phase
After fixing error, discard old stack traces:
\`\`\`
// Bug fixed, tests passing
agent_context_optimize({ action: "discard", targets: [["111aaa"]] })  // old error output
agent_context_optimize({ action: "distill", targets: [["222bbb", "Fixed: null check in getUserById"]] })
\`\`\`

## Hash Format

- Exactly 6 hex characters (0-9, a-f)
- No prefixes, no separators

Example — extracting thinking block hash:
  <thinking>
  The user wants to implement auth...
  <reasoning_hash>abc123</reasoning_hash>
  </thinking>
  
  → Hash is: abc123
  → Prune: agent_context_optimize({ action: "discard", targets: [["abc123"]] })
`
