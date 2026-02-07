export default `
Manage conversation context. Remove noise, preserve essentials.

## Actions

| Action | Purpose | Format | Token Savings |
|--------|---------|--------|---------------|
| discard | Remove content entirely | [["hash"], ...] | ~100% of target |
| distill | Replace with summary | [["hash", "summary"], ...] | ~80% of target |

## Target Types

| Type | Format | Typical Size | Prune Priority |
|------|--------|--------------|----------------|
| Tool output | 6 hex chars | 500-5000 tokens | High |
| Message part | 6 hex chars | 200-2000 tokens | Medium |
| Thinking block | 6 hex chars | 1000-3000 tokens | **HIGHEST** |

All hashes are auto-detected from state registry. No prefixes needed.

### Hash Locations

- \`<tool_hash>\` — End of tool outputs (read, bash, glob, grep)
- \`<message_hash>\` — End of assistant text messages  
- \`<reasoning_hash>\` — End of thinking/reasoning blocks

## When to Prune

| Context Pressure | Recommended Action |
|------------------|-------------------|
| Light (<50%) | No action needed |
| Moderate (50-75%) | Prune completed phase work |
| High (75-90%) | Batch prune + distill reasoning |
| Critical (>90%) | Aggressive discard all disposable |

**Prune after:** Completing research, analysis, or implementation phases.

## High-Value Targets

**Thinking blocks are your largest context consumers** (~2000+ tokens each).

Prune thinking blocks when:
1. Analysis is complete and conclusions are documented
2. Switching to a new task or phase
3. After implementing a plan (reasoning no longer needed)

Prefer \`distill\` over \`discard\` to preserve decision rationale.

## What to Preserve

**NEVER prune:**
- Active todo items (in_progress status)
- Recent file edits (last 5 turns)
- Error context being debugged
- Protected tools: todowrite, task, write, edit

**Safe to prune:**
- Tool outputs from completed phases
- Old assistant explanations (>10 turns ago)
- Thinking blocks after conclusions documented

## Examples

Discard completed work:
  context_prune({ action: "discard", targets: [["a1b2c3"], ["d4e5f6"], ["g7h8i9"]] })

Distill thinking with rationale:
  context_prune({ 
    action: "distill", 
    targets: [["abc123", "Chose JWT: stateless, scales better. Rejected OAuth: overkill."]] 
  })

Mixed cleanup after phase:
  context_prune({ 
    action: "discard", 
    targets: [
      ["a1b2c3"],  // tool output
      ["d4e5f6"],  // message part
      ["abc123"]   // reasoning block (auto-converts to distill)
    ] 
  })

## Distill Best Practices

Effective summaries include:
- **What was decided** — the chosen approach
- **Why it was chosen** — key reasoning
- **What was rejected** — prevents re-exploration

Bad: "Analysis complete"
Good: "Chose JWT over sessions: stateless, scales better. Rejected OAuth: overkill."

## Auto-Conversion (Thinking Mode)

When thinking mode is enabled, discarding reasoning blocks auto-converts to distill:

\`\`\`
context_prune({ action: "discard", targets: [["abc123"]] })  // reasoning block
→ Auto-converts to: distill with "—" placeholder
\`\`\`

**Why?** Thinking mode APIs require \`reasoning_content\` to exist on assistant messages. Discarding would remove it entirely, causing API errors.

## Batching Strategy

Batch multiple targets in one call for efficiency:

- Reduces tool call overhead
- Atomic operation
- Better context pressure management

**When to batch:**
- After completing a phase (research, implement, test)
- Context pressure exceeds 75%

## Workflow Examples

**Research Phase** — After finding targets:
  context_prune({ action: "discard", targets: [["a1b2c3"], ["d4e5f6"]] })  // old searches

**Implementation Phase** — After successful edits:
  context_prune({ action: "discard", targets: [["abc123"], ["def456"]] })  // failed attempts

**Debug Phase** — After fixing errors:
  context_prune({ action: "distill", targets: [["222bbb", "Fixed: null check in getUserById"]] })

## Hash Format

Exactly 6 hex characters (0-9, a-f). Extract from tags:
  \`<tool_hash>a1b2c3</tool_hash>\` → Hash: a1b2c3
`
