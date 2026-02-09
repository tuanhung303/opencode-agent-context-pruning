# Agentic Context Pruning (ACP)

[![npm version](https://img.shields.io/npm/v/@tuanhung303/opencode-acp.svg)](https://www.npmjs.com/package/@tuanhung303/opencode-acp)
[![CI](https://github.com/tuanhung303/opencode-agent-context-pruning/workflows/CI/badge.svg)](https://github.com/tuanhung303/opencode-agent-context-pruning/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

<p align="center">
  <img src="assets/agent_context.png" alt="Agent Context Pruning" width="350">
</p>

Your AI agent wastes half its tokens re-reading old tool outputs, stale file contents, and duplicate results. ACP fixes that — it's a zero-config [OpenCode](https://github.com/nichochar/opencode) plugin that automatically prunes obsolete context so your agent stays fast, cheap, and focused.

---

## Before / After

```
 WITHOUT ACP                          WITH ACP
┌──────────────────────────┐        ┌──────────────────────────┐
│ read(config.ts)    3k tk │        │                          │
│ edit(config.ts)    2k tk │        │                          │
│ read(config.ts)    3k tk │  ───►  │ read(config.ts)    3k tk │ ← latest only
│ git status         1k tk │        │ git status         1k tk │ ← latest only
│ git status         1k tk │        │                          │
│ glob(**/*.ts)      4k tk │        │ glob(**/*.ts)      4k tk │
├──────────────────────────┤        ├──────────────────────────┤
│ Total: ~14k tokens       │        │ Total: ~8k tokens  -43%  │
└──────────────────────────┘        └──────────────────────────┘
```

| Workload            | Without ACP  | With ACP    | Savings |
| ------------------- | ------------ | ----------- | ------- |
| **Typical Session** | ~80k tokens  | ~40k tokens | **50%** |
| **Long Session**    | ~150k tokens | ~75k tokens | **50%** |
| **File-Heavy Work** | ~100k tokens | ~35k tokens | **65%** |

---

## Quick Start

Add to your OpenCode config:

```jsonc
// opencode.jsonc
{
    "plugin": ["@tuanhung303/opencode-acp@latest"],
}
```

That's it. ACP works out of the box — no configuration needed.

---

## What It Does

- 🔁 **Auto-deduplicates** — re-reads of the same file, duplicate `git status`, repeated URL fetches are automatically superseded ([details](docs/AUTO_SUPERSEDE.md))
- 📁 **One-file-one-view** — only the latest read/write/edit of each file stays in context
- 🧹 **Manual pruning** — agents can `discard`, `distill`, or `replace` any context block by hash ([API reference](docs/API_REFERENCE.md))
- 🔖 **Todo reminders** — nudges agents when tasks are forgotten or stuck
- 🧠 **Thinking mode safe** — fully compatible with Anthropic, DeepSeek, and Kimi extended thinking APIs ([details](docs/ARCHITECTURE.md#provider-compatibility))
- ⚡ **Zero-config** — works immediately, with optional [presets](docs/CONFIGURATION.md) for fine-tuning

---

## Configuration

ACP works with zero config. For fine-tuning, use presets:

```jsonc
// .opencode/acp.jsonc
{
    "strategies": {
        "aggressivePruning": {
            "preset": "balanced", // "compact" | "balanced" | "verbose"
        },
    },
}
```

| Preset       | Description                          | Best For                         |
| ------------ | ------------------------------------ | -------------------------------- |
| **compact**  | Maximum cleanup, all options enabled | Long sessions, token-constrained |
| **balanced** | Good defaults, preserves user code   | Most use cases _(default)_       |
| **verbose**  | Minimal cleanup, preserves all       | Debugging, audit trails          |

→ [Full configuration reference](docs/CONFIGURATION.md)

---

## Documentation

| Document                                     | Description                                                |
| -------------------------------------------- | ---------------------------------------------------------- |
| [Configuration](docs/CONFIGURATION.md)       | Full config reference, all flags, protected tools          |
| [API Reference](docs/API_REFERENCE.md)       | `context_prune` tool interface, batch ops, pattern replace |
| [Auto-Supersede](docs/AUTO_SUPERSEDE.md)     | All 8 automatic deduplication strategies                   |
| [Troubleshooting](docs/TROUBLESHOOTING.md)   | Common errors and fixes                                    |
| [Architecture](docs/ARCHITECTURE.md)         | Plugin internals and message flow                          |
| [Validation Guide](docs/VALIDATION_GUIDE.md) | 43 test scenarios                                          |
| [Changelog](CHANGELOG.md)                    | Version history                                            |

---

## Provider Compatibility

| Provider  | Thinking Mode     | Compatible | Notes                |
| --------- | ----------------- | ---------- | -------------------- |
| Anthropic | Extended thinking | ✅         | Strict validation    |
| DeepSeek  | DeepThink         | ✅         | Similar to Anthropic |
| Kimi      | K1 thinking       | ✅         | Similar to Anthropic |
| OpenAI    | —                 | ✅         | No thinking mode     |
| Google    | —                 | ✅         | No thinking mode     |

---

## Contributing

1. Fork → 2. Branch → 3. `npm test` → 4. PR

**CI/CD**: PRs run lint + type check + tests automatically. Merges to `main` auto-publish to npm.

## License

MIT © [tuanhung303](https://github.com/tuanhung303)

---

<details id="-known-pitfalls-for-agents" open>
<summary><strong>⚠️ Known Pitfalls for Agents</strong> — Critical rules when modifying ACP code</summary>

> **Read this section before modifying ACP code.** These are hard-won lessons from debugging production issues.

### 1. Always Fetch Messages in All Code Paths

**❌ WRONG:**

```typescript
async function executeContextToolDiscard(ctx, toolCtx, hashes) {
    const { state, logger } = ctx

    // Validate hashes...

    if (validHashes.length === 0) {
        // Early return without fetching messages
        const currentParams = getCurrentParams(state, [], logger)  // ← BUG: Empty array
        return "No valid hashes"
    }

    // Only fetch messages in success path
    const messages = await client.session.messages(...)
}
```

**✅ CORRECT:**

```typescript
async function executeContextToolDiscard(ctx, toolCtx, hashes) {
    const { client, state, logger } = ctx

    // ALWAYS fetch messages first - required for thinking mode API compatibility
    const messagesResponse = await client.session.messages({
        path: { id: toolCtx.sessionID },
    })
    const messages = messagesResponse.data || messagesResponse

    // ALWAYS initialize session - syncs reasoning_content
    await ensureSessionInitialized(client, state, toolCtx.sessionID, logger, messages)

    // Now validate hashes...

    if (validHashes.length === 0) {
        const currentParams = getCurrentParams(state, messages, logger) // ← Use actual messages
        return "No valid hashes"
    }
}
```

**Why?** Anthropic's thinking mode API requires `reasoning_content` on all assistant messages with tool calls. Skipping `ensureSessionInitialized` causes 400 errors.

---

### 2. Never Skip `ensureSessionInitialized`

This function syncs `reasoning_content` from message parts to `msg.info`. Without it:

```
error, status code: 400, message: thinking is enabled but reasoning_content is missing
in assistant tool call message at index 2
```

**Rule:** Call `ensureSessionInitialized` at the START of every context_prune tool function, before any early returns.

---

### 3. Thinking Mode: Distill, Don't Discard Reasoning

**❌ WRONG:**

```typescript
// Completely removing reasoning_content breaks API
state.prune.reasoningPartIds.push(partId)
// No replacement content → field removed → API error
```

**✅ CORRECT:**

```typescript
// Convert discard to distill with minimal placeholder
if (reasoningHashes.length > 0) {
    const minimalSummaries = reasoningHashes.map(() => "—")
    await executeContextReasoningDistill(
        ctx,
        toolCtx,
        reasoningHashes.map((h, i) => [h, minimalSummaries[i]]),
    )
}
```

**Why?** The `reasoning_content` field must exist (even if minimal) for thinking mode providers.

---

### 4. Test with Non-Existing Hashes

Always test context_prune tool changes with:

1. Valid existing hashes (success path)
2. Non-existing hashes like `"zzzzzz"` (no-op path)
3. Mix of valid and invalid hashes

The no-op path is where most bugs hide because it's less tested.

---

### 5. Provider-Specific Behavior

| Provider  | Thinking Mode     | `reasoning_content` Required | Notes                |
| --------- | ----------------- | ---------------------------- | -------------------- |
| Anthropic | Extended thinking | ✅ Yes                       | Strict validation    |
| DeepSeek  | DeepThink         | ✅ Yes                       | Similar to Anthropic |
| Kimi      | K1 thinking       | ✅ Yes                       | Similar to Anthropic |
| OpenAI    | N/A               | ❌ No                        | No thinking mode     |
| Google    | N/A               | ❌ No                        | No thinking mode     |

**Always test with Anthropic** when modifying context/pruning logic—it has the strictest API validation.

---

### 6. The Transform Hook Timing

```
User Message → Transform Hook → ensureReasoningContentSync → API Call
                    ↑
            Context tool runs HERE
```

If context_prune tool returns early (no-op), the transform hook may not have synced `reasoning_content` yet. That's why each tool function must call `ensureSessionInitialized` itself.

---

### 7. Debug Checklist

When you see `reasoning_content is missing` errors:

1. **Check the error index** - "at index 2" means the 3rd message in the array
2. **Verify message fetch** - Is the function fetching messages before early returns?
3. **Verify session init** - Is `ensureSessionInitialized` called in ALL code paths?
4. **Check the no-op path** - Does the early return path have proper initialization?
5. **Test with invalid hash** - `context_prune({ action: "discard", targets: [["zzzzzz"]] })`

</details>

---

<details>
<summary><strong>🗨️ For LLM Agents</strong> — Quick pruning reference and safety guidelines</summary>

If you're an AI assistant reading this:

> **Quick Pruning Reference:**
>
> - Light pressure (<50%): No action
> - Moderate (50-75%): Prune old tool outputs using `context_prune({ action: "discard", targets: [[hash]] })`
> - High (75-90%): Anchor critical info, then batch prune non-essential items
> - Critical (>90%): Aggressively discard all disposable context
>
> **Always Protect:** Active todos, current file edits, user requirements

Ask the user: "Would you like me to run a context optimization check?"

</details>
