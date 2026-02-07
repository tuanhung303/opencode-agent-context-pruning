export default `
Manage conversation context. Remove noise, preserve essentials.

## Actions

| Action | Purpose | Target Format |
|--------|---------|---------------|
| discard | Remove entirely | [["hash"], ...] |
| distill | Replace with summary | [["hash", "summary"], ...] |
| replace | Replace by pattern | [["start", "end", "replacement"], ...] |

## Hash Locations

All hash tags appear in **tool outputs** (the primary visible channel):

| Hash Type | What It Targets | Where You Find It |
|-----------|----------------|-------------------|
| \`<tool_hash>\` | Tool call output (read, glob, bash, etc.) | In that tool's output |
| \`<reasoning_hash>\` | Thinking/reasoning block | In the last tool output of the same response |
| \`<message_hash>\` | Assistant text response | In the last tool output of the same response |

All hash types use the same 6-char hex format (e.g., \`a1b2c3\`). Use any hash with discard/distill.

## Why Prune: Before & After

**BEFORE (~3500 tokens):**

  User: Analyze this codebase

  Assistant: Here is my analysis...

  [glob: found 47 files in src/]
  <tool_hash>a1b2c3</tool_hash>

  [read: auth.ts - 200 lines of code]
  <tool_hash>d4e5f6</tool_hash>
  <reasoning_hash>abc123</reasoning_hash>
  <message_hash>fed987</message_hash>

  Detailed findings from analysis:
  - Authentication: Currently using sessions...
  - Database: PostgreSQL with connection pooling...
  - API: REST endpoints need rate limiting...
  End of detailed findings.

  Recommendations: Use JWT for auth.

**PRUNE (one call, all three actions):**

  context_prune({ action: "distill", targets: [["abc123", "Chose JWT: stateless, scalable"]] })
  context_prune({ action: "discard", targets: [["a1b2c3"], ["d4e5f6"], ["fed987"]] })
  context_prune({ action: "replace", targets: [["Detailed findings from analysis:", "End of detailed findings.", "[analysis complete]"]] })

**AFTER (~150 tokens):**

  User: Analyze this codebase

  Assistant: Here is my analysis...

  [glob() output pruned]

  [read() output pruned]

  [analysis complete]

  Recommendations: Use JWT for auth.

**Result: Saved ~3350 tokens (96% reduction)**

## Batching Strategy

1. **Batch everything** - One call, many targets
2. **Prune early and often** - After each phase completion
3. **Silently** - Never mention pruning to users

## Prune Triggers

- After research phase (discard exploration outputs)
- After successful implementation (discard failed attempts)
- After error resolution (discard old stack traces)
- Any output >500 tokens you will not reference again

## Distill Best Practices

Include: decision made, why chosen, what rejected.

Bad: "Analysis complete"
Good: "Chose JWT: stateless, scalable. Rejected sessions: no horizontal scaling."

## Pattern Replace Constraints

- Match content must be >=30 characters
- Start OR end pattern must be >15 characters
- Literal matching only (no regex)
- Exactly one match per pattern
- No overlapping patterns
`
