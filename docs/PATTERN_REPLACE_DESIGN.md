# Pattern-Based Pruning Design Specification

## Overview

Add a new `replace` action to the context tool that enables agents to prune content by specifying start/end patterns with replacement text. This provides more granular control than hash-based pruning for large text blocks.

## Design Principles

1. **Compatibility**: Works alongside existing `discard`/`distill` actions
2. **Safety**: Minimum 30-character restriction prevents accidental over-pruning
3. **Multiple ingestion**: Supports batch operations like the current context tool
4. **Predictable**: Explicit start/end markers ensure precise targeting

## API Design

### New Action: `replace`

```typescript
interface ReplaceOperation {
    start: string // Pattern marking the beginning of content to replace
    end: string // Pattern marking the end of content to replace
    replacement: string // Text to insert in place (e.g., "…", "[redacted]")
}

type ContextTarget =
    | [string] // discard: [hash]
    | [string, string] // distill: [hash, summary]
    | ReplaceOperation // replace: { start, end, replacement }
```

### Usage Examples

````typescript
// Single replacement
context({
    action: "replace",
    targets: [
        {
            start: "Detailed analysis of all 47 files",
            end: "End of file analysis report",
            replacement: "[file analysis: 47 files reviewed]",
        },
    ],
})

// Multiple replacements (batch)
context({
    action: "replace",
    targets: [
        {
            start: "START_DEBUG_LOG",
            end: "END_DEBUG_LOG",
            replacement: "…",
        },
        {
            start: '```json\n{"verbose": true',
            end: "}\n```",
            replacement: "[verbose config]",
        },
    ],
})

// Mixed operations in single call
context({
    action: "replace",
    targets: [
        { start: "a quick brown fox", end: "jumps over", replacement: "a quick…jumps over" },
        { start: "detailed stack trace", end: "at processTicks", replacement: "[error occurred]" },
    ],
})
````

## Validation Rules

| Rule                 | Constraint                  | Rationale                                               |
| -------------------- | --------------------------- | ------------------------------------------------------- |
| Minimum match length | 30+ characters              | Prevents accidental pruning of small, important details |
| Pattern uniqueness   | Warning if multiple matches | Alerts agent to ambiguous patterns                      |
| Overlapping ranges   | Error if overlaps detected  | Prevents undefined behavior                             |
| Empty replacement    | Allowed ("…" is common)     | Supports ellipsis notation                              |
| Regex support        | No (literal matching only)  | Safer, more predictable behavior                        |

## Implementation Architecture

### File Structure

```
lib/strategies/
├── context.ts              # Add replace action handler
├── replace.ts              # NEW: Pattern replacement logic
└── _types.ts               # Add ReplaceOperation type

lib/prompts/
├── context-spec.ts         # Update with replace documentation
└── replace-spec.ts         # NEW: Detailed replace guide

lib/messages/
└── replace.ts              # NEW: Content modification utilities
```

### Core Algorithm

```typescript
interface MatchResult {
    messageId: string
    partIndex: number
    startIndex: number
    endIndex: number
    originalLength: number
}

async function executeReplace(
    ctx: PruneToolContext,
    operations: ReplaceOperation[],
): Promise<ReplaceResult> {
    // 1. Find all matches across messages
    const matches = findPatternMatches(messages, operations)

    // 2. Validate matches
    validateMatches(matches, {
        minLength: 30,
        allowOverlapping: false,
        requireUnique: true,
    })

    // 3. Sort by position (descending) to maintain indices during replacement
    const sortedMatches = sortMatchesByPosition(matches, "desc")

    // 4. Apply replacements
    const results = applyReplacements(messages, sortedMatches, operations)

    // 5. Update session state with modified messages
    await updateSessionMessages(client, sessionId, results.messages)

    // 6. Track replacements for undo/audit
    recordReplacements(state, results.replacements)

    return results
}
```

### Message Modification Flow

```
Original Message:
┌─────────────────────────────────────────────────────┐
│ User: Analyze this codebase                         │
│ Assistant: Here's detailed analysis...              │
│                                                                          │
│ Detailed analysis of all 47 files:                  │
│ - File 1: 200 lines reviewed...                     │
│ - File 2: 150 lines reviewed...                     │
│ ... (45 more files) ...                             │
│ End of file analysis report                         │
│                                                                          │
│ Recommendation: Refactor auth module                │
└─────────────────────────────────────────────────────┘

After Replace:
┌─────────────────────────────────────────────────────┐
│ User: Analyze this codebase                         │
│ Assistant: Here's detailed analysis...              │
│                                                                          │
│ [file analysis: 47 files reviewed]                  │
│                                                                          │
│ Recommendation: Refactor auth module                │
└─────────────────────────────────────────────────────┘
```

## Type Schema

```typescript
// lib/strategies/_types.ts

export interface ReplaceOperation {
    /** Pattern marking the start of content to replace */
    start: string
    /** Pattern marking the end of content to replace */
    end: string
    /** Replacement text to insert */
    replacement: string
}

export type ContextTarget =
    | [string] // discard
    | [string, string] // distill
    | ReplaceOperation // replace

export interface ReplaceResult {
    success: boolean
    replacements: Array<{
        operation: ReplaceOperation
        messageId: string
        originalLength: number
        newLength: number
        tokensSaved: number
    }>
    errors: string[]
}
```

## Integration with Context Tool

```typescript
// lib/strategies/context.ts

const CONTEXT_TOOL_SPEC = loadPrompt("context-spec")

export function createContextTool(ctx: PruneToolContext) {
    return tool({
        description: CONTEXT_TOOL_SPEC,
        args: {
            action: tool.schema
                .enum(["discard", "distill", "replace"]) // Add "replace"
                .describe("Action: discard, distill, or replace"),
            targets: tool.schema
                .array(
                    tool.schema.union([
                        // Existing formats
                        tool.schema.tuple([tool.schema.string()]),
                        tool.schema.tuple([tool.schema.string(), tool.schema.string()]),
                        // New replace format
                        tool.schema.object({
                            start: tool.schema.string().describe("Start pattern"),
                            end: tool.schema.string().describe("End pattern"),
                            replacement: tool.schema.string().describe("Replacement text"),
                        }),
                    ]),
                )
                .describe("Array of targets based on action type"),
        },
        async execute(args, toolCtx) {
            const { action, targets } = args

            if (action === "replace") {
                return executeReplace(ctx, toolCtx, targets as ReplaceOperation[])
            }

            // Existing discard/distill logic...
            return executeContext(ctx, toolCtx, action, targets)
        },
    })
}
```

## Prompt Specification

```typescript
// lib/prompts/replace-spec.ts

export default `
## Pattern-Based Replacement

Replace content between start/end patterns with concise alternatives.

### When to Use

- Large repetitive outputs (logs, traces, verbose configs)
- Intermediate analysis that's no longer needed
- Verbose code blocks that have been processed

### Format

\`\`\`typescript
{
  start: "pattern_start",      // Exact text marking beginning
  end: "pattern_end",          // Exact text marking end
  replacement: "…"             // Text to insert (can be short)
}
\`\`\`

### Constraints

| Constraint | Value | Purpose |
|------------|-------|---------|
| Min match length | 30 chars | Prevents over-pruning |
| Pattern matching | Literal (no regex) | Predictable behavior |
| Multiple matches | Warning issued | Alerts to ambiguity |
| Overlapping | Not allowed | Prevents conflicts |

### Examples

**Prune debug logs:**
\`\`\`
{ 
  start: "DEBUG: Starting request handler",
  end: "DEBUG: Request handler completed", 
  replacement: "[request handled]"
}
\`\`\`

**Collapse verbose output:**
\`\`\`
{
  start: "npm install output:",
  end: "added 847 packages",
  replacement: "…"
}
\`\`\`

**Redact sensitive data:**
\`\`\`
{
  start: "API_KEY=",
  end: "\n",
  replacement: "[REDACTED]"
}
\`\`\`

### Best Practices

1. **Choose unique patterns** - Avoid common words as start/end
2. **Verify length** - Ensure match is >30 chars before calling
3. **Use semantic replacements** - "[47 files analyzed]" vs just "…"
4. **Batch related replacements** - Single call with multiple targets
`
```

## Error Handling

| Error              | Condition                      | Response                                |
| ------------------ | ------------------------------ | --------------------------------------- |
| Pattern not found  | Start or end pattern missing   | Suggest similar patterns found          |
| Match too short    | < 30 characters                | Reject with length warning              |
| Multiple matches   | Pattern appears multiple times | List all matches, ask for clarification |
| Overlapping ranges | Two operations overlap         | Error with overlapping details          |
| Ambiguous pattern  | Pattern in multiple messages   | Include message context in error        |

## Testing Strategy

```typescript
// tests/e2e/pattern-replace.test.ts

describe("Pattern-based replacement", () => {
    test("t1: Replace single block >30 chars", async () => {
        const result = await executeReplace([
            {
                start: "START_VERBOSE_OUTPUT",
                end: "END_VERBOSE_OUTPUT",
                replacement: "…",
            },
        ])
        expect(result.replacements[0].originalLength).toBeGreaterThan(30)
        expect(result.replacements[0].tokensSaved).toBeGreaterThan(0)
    })

    test("t2: Reject replacement <30 chars", async () => {
        await expect(
            executeReplace([
                {
                    start: "ab",
                    end: "cd",
                    replacement: "…",
                },
            ]),
        ).rejects.toThrow(/minimum 30 characters/)
    })

    test("t3: Handle multiple replacements in batch", async () => {
        const operations = [
            { start: "LOG_1_START", end: "LOG_1_END", replacement: "[log1]" },
            { start: "LOG_2_START", end: "LOG_2_END", replacement: "[log2]" },
        ]
        const result = await executeReplace(operations)
        expect(result.replacements).toHaveLength(2)
    })

    test("t4: Detect overlapping patterns", async () => {
        await expect(
            executeReplace([
                { start: "A", end: "C", replacement: "…" },
                { start: "B", end: "D", replacement: "…" },
            ]),
        ).rejects.toThrow(/overlapping/)
    })
})
```

## Migration Path

1. **Phase 1**: Add `replace` action alongside existing actions
2. **Phase 2**: Update context-spec prompt with replace documentation
3. **Phase 3**: Add replace-specific prompt for detailed guidance
4. **Phase 4**: E2E tests for pattern replacement scenarios
5. **Phase 5**: Update AGENTS.md with replace best practices

## Compatibility Notes

- **Backwards compatible**: Existing `discard`/`distill` calls unchanged
- **SDK compatibility**: Works with current message part structure
- **State management**: Replacements tracked separately from hash-based pruning
- **Undo support**: Replacement history preserved for potential rollback

## Open Questions

1. Should we support regex patterns in v2? (Currently: literal only)
2. Should replacements be reversible/tracked for debugging?
3. Should we auto-suggest patterns for common cases (stack traces, npm output)?
