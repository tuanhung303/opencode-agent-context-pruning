# Provider-Specific: Thinking Mode API Compatibility

## The Problem

When using **Anthropic's API with extended thinking mode enabled**, the API enforces a strict requirement:

> **All assistant messages containing tool calls MUST have a `reasoning_content` field.**

Failure to include this field results in a `400 Bad Request` error:

```
error, status code: 400, message: thinking is enabled but reasoning_content is missing
in assistant tool call message at index 2
```

## Root Cause (Fixed in v3.0.0)

The context tool's no-op paths (when receiving non-existing hashes) were skipping critical initialization:

```typescript
// BROKEN: No-op path skipped message fetch
if (validHashes.length === 0) {
    const currentParams = getCurrentParams(state, [], logger)  // ← Empty array!
    await sendAttemptedNotification(...)
    return `No valid tool hashes to discard`
}
```

**Why this caused the error:**

1. User calls `context({ action: "discard", targets: [["zzzzzz"]] })` with non-existing hash
2. No-op path returns early without fetching messages
3. `ensureSessionInitialized` never runs → `reasoning_content` not synced
4. Next API call includes assistant message with tool call but missing `reasoning_content`
5. Anthropic API rejects with 400 error

## The Fix

All context tool paths now **always** fetch messages and initialize session state:

```typescript
// FIXED: Always fetch messages for proper state sync
export async function executeContextToolDiscard(ctx, toolCtx, hashes) {
    const { client, state, logger, config } = ctx
    const sessionId = toolCtx.sessionID

    // Always fetch messages (required for thinking mode API compatibility)
    const messagesResponse = await client.session.messages({
        path: { id: sessionId },
    })
    const messages = messagesResponse.data || messagesResponse

    // Ensures reasoning_content is synced on all assistant messages with tool calls
    await ensureSessionInitialized(client, state, sessionId, logger, messages)

    // ... rest of function

    if (validHashes.length === 0) {
        const currentParams = getCurrentParams(state, messages, logger) // ← Actual messages
        // ...
    }
}
```

## Functions Fixed

| File                        | Function                         | Issue                            |
| --------------------------- | -------------------------------- | -------------------------------- |
| `lib/strategies/discard.ts` | `executeContextToolDiscard`      | No-op path skipped message fetch |
| `lib/strategies/discard.ts` | `executeContextMessageDiscard`   | No-op path skipped message fetch |
| `lib/strategies/discard.ts` | `executeContextReasoningDiscard` | No-op path skipped message fetch |
| `lib/strategies/distill.ts` | `executeContextToolDistill`      | No-op path skipped message fetch |
| `lib/strategies/distill.ts` | `executeContextMessageDistill`   | No-op path skipped message fetch |
| `lib/strategies/distill.ts` | `executeContextReasoningDistill` | No-op path skipped message fetch |

## How `ensureReasoningContentSync` Works

Located in `lib/messages/prune.ts`, this function ensures API compatibility:

```typescript
export const ensureReasoningContentSync = (state, messages, logger) => {
    for (const msg of messages) {
        // Only process assistant messages
        if (msg.info.role !== "assistant") continue

        // Check if message has tool calls
        const hasToolCalls = parts.some((p) => p.type === "tool" && p.callID)
        if (!hasToolCalls) continue

        // Skip if reasoning_content already exists
        if (msg.info.reasoning_content) continue

        // Find reasoning content from parts and sync to msg.info
        const reasoningPart = parts.find((p) => p.type === "reasoning" && p.text)
        if (reasoningPart) {
            msg.info.reasoning_content = reasoningPart.text
        }
    }
}
```

## Thinking Mode Safety: Auto-Convert Discard to Distill

For reasoning blocks, ACP automatically converts `discard` to `distill` with a minimal placeholder:

```typescript
// In lib/strategies/context.ts
if (reasoningHashes.length > 0) {
    // Auto-convert to distill to preserve reasoning_content field structure
    const minimalSummaries = reasoningHashes.map(() => "—")
    reasoningResult = await executeContextReasoningDistill(
        ctx,
        toolCtx,
        reasoningHashes.map((h, i) => [h, minimalSummaries[i]]),
    )
}
```

**Why?** Completely discarding reasoning content would remove the `reasoning_content` field, causing API validation errors. Distilling with "—" preserves the field structure while minimizing token usage.

## Affected Providers

| Provider  | Thinking Mode     | Requires `reasoning_content` |
| --------- | ----------------- | ---------------------------- |
| Anthropic | Extended thinking | ✅ Yes                       |
| DeepSeek  | DeepThink         | ✅ Yes                       |
| Kimi      | K1 thinking       | ✅ Yes                       |
| OpenAI    | N/A               | ❌ No                        |
| Google    | N/A               | ❌ No                        |

## Verification

To verify the fix works:

```typescript
// This should NOT cause a 400 error anymore
context({ action: "discard", targets: [["zzzzzz"]] }) // Non-existing hash
```

Expected output:

```
「 🗑️ discard ✓ 」- ⚙️ zzzzzz
No valid tool hashes to discard
```

---

**See Also:** [Known Pitfalls](../README.md#-known-pitfalls-for-agents) for development guidance when modifying context/pruning logic.
