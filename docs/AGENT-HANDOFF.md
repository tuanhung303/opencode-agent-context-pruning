# Agent Handoff Document

This document provides context for future agents working on the ACP (Agentic Context Pruning) plugin.

## Current State (v2.4.0)

### What's Implemented

| Feature                                                         | Status | Location                                 |
| --------------------------------------------------------------- | ------ | ---------------------------------------- |
| Hash-based tool identification                                  | ✅     | `lib/messages/inject.ts`                 |
| Discard tool                                                    | ✅     | `lib/strategies/tools.ts`                |
| Extract tool (with preserve option)                             | ✅     | `lib/strategies/tools.ts`                |
| Restore tool                                                    | ✅     | `lib/strategies/tools.ts`                |
| Deduplication strategy                                          | ✅     | `lib/strategies/deduplication.ts`        |
| Fuzzy deduplication (overlapping reads)                         | ✅     | `lib/strategies/deduplication.ts`        |
| Supersede writes strategy                                       | ✅     | `lib/strategies/supersede-writes.ts`     |
| Purge errors strategy                                           | ✅     | `lib/strategies/purge-errors.ts`         |
| **Head-Tail Truncation strategy**                               | ✅     | `lib/strategies/truncation.ts`           |
| **Thinking Block Compression strategy**                         | ✅     | `lib/strategies/thinking-compression.ts` |
| Auto-prune after tool execution                                 | ✅     | `lib/hooks.ts`                           |
| Simplified notification format                                  | ✅     | `lib/ui/utils.ts`                        |
| Strategy effectiveness tracking                                 | ✅     | `lib/state/types.ts`                     |
| Protected tools/files                                           | ✅     | `lib/config.ts`                          |
| Slash commands (/acp, stats, context, sweep, protected, budget) | ✅     | `lib/commands/`                          |

### Key Files

```
lib/
├── config.ts              # Configuration with autoPruneAfterTool
├── hooks.ts               # Hook handlers (transform + tool.execute.after)
├── strategies/
│   ├── index.ts           # Strategy exports
│   ├── deduplication.ts   # Dedup + fuzzy dedup
│   ├── supersede-writes.ts
│   ├── purge-errors.ts
│   ├── truncation.ts      # NEW: Head-tail truncation for large outputs
│   ├── thinking-compression.ts  # NEW: Compress old thinking blocks
│   └── tools.ts           # discard/extract/restore tools
├── ui/
│   ├── notification.ts    # Unified notification system
│   └── utils.ts           # Formatting utilities
├── state/
│   ├── types.ts           # State interfaces (includes strategy stats)
│   ├── state.ts           # State initialization
│   └── persistence.ts     # State save/load
├── logger.ts              # Logging with daily rotation
└── commands/
    ├── stats.ts           # /acp stats command
    ├── context.ts         # /acp context command
    ├── sweep.ts           # /acp sweep command
    ├── protected.ts       # /acp protected command
    └── budget.ts          # /acp budget command
```

---

## Testing & Verification

### Log File Locations

ACP writes logs to `~/.config/opencode/logs/acp/`:

```bash
# Directory structure
~/.config/opencode/logs/acp/
├── daily/
│   └── YYYY-MM-DD.log     # Daily rotating log files
└── context/
    └── <session-id>/      # Context snapshots per session
        └── <timestamp>.json
```

### How to Test the Plugin

#### 1. Build and Link Locally

```bash
cd /Users/_blitzzz/Documents/GitHub/oc-agent-context-pruning

# Build the plugin
npm run build

# Link for local testing
npm link

# Verify link
ls -la $(npm root -g)/@tuanhung303/opencode-acp
```

#### 2. Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Type check only
npm run typecheck
```

#### 3. Live Testing in OpenCode

Start a new OpenCode session and perform actions that trigger strategies:

```bash
# Start opencode
opencode

# In the session, perform actions like:
# - Read multiple files (triggers deduplication)
# - Edit files (triggers supersede-writes)
# - Make errors (triggers purge-errors)
# - Read large files and wait 2+ turns (triggers truncation)
# - Use extended thinking and wait 3+ turns (triggers thinking compression)
```

### Verifying Strategies via Logs

#### View Today's Log

```bash
# View full log
cat ~/.config/opencode/logs/acp/daily/$(date +%Y-%m-%d).log

# View last 100 lines
tail -100 ~/.config/opencode/logs/acp/daily/$(date +%Y-%m-%d).log

# Follow log in real-time
tail -f ~/.config/opencode/logs/acp/daily/$(date +%Y-%m-%d).log
```

#### Check Specific Strategies

```bash
# Check if truncation strategy is working
grep -E "(Truncated|truncation)" ~/.config/opencode/logs/acp/daily/$(date +%Y-%m-%d).log

# Check if thinking compression is working
grep -E "(Compressed|thinkingCompression)" ~/.config/opencode/logs/acp/daily/$(date +%Y-%m-%d).log

# Check deduplication
grep -E "(Dedup|deduplicate)" ~/.config/opencode/logs/acp/daily/$(date +%Y-%m-%d).log

# Check supersede-writes
grep -E "(Supersede|supersede)" ~/.config/opencode/logs/acp/daily/$(date +%Y-%m-%d).log

# Check purge-errors
grep -E "(Purge|purge.*error)" ~/.config/opencode/logs/acp/daily/$(date +%Y-%m-%d).log

# Check all auto-pruning activity
grep -E "(Auto-pruned|auto-prune)" ~/.config/opencode/logs/acp/daily/$(date +%Y-%m-%d).log
```

#### Expected Log Output Examples

**Truncation Strategy:**

```
2026-01-31T10:15:23.456Z INFO  truncation: Truncated 3 large outputs, saved ~4500 tokens
2026-01-31T10:15:23.456Z DEBUG truncation: Truncated read output | callId=call_abc123 originalTokens=3000 newTokens=800 tokensSaved=2200
```

**Thinking Compression:**

```
2026-01-31T10:20:45.789Z INFO  thinking-compression: Compressed 2 thinking block(s), saved ~8000 tokens
2026-01-31T10:20:45.789Z DEBUG thinking-compression: Compressed thinking block | messageAge=4 originalTokens=5000 newTokens=500 tokensSaved=4500
```

**Deduplication:**

```
2026-01-31T10:25:12.345Z INFO  deduplication: Deduplicated 2 tool outputs
```

### Using /acp Commands

In an OpenCode session, use these commands to inspect state:

```
/acp stats      # View strategy statistics and token savings
/acp context    # View current context usage
/acp sweep      # Manually trigger aggressive pruning
/acp protected  # View protected tools/files
/acp budget     # View/set token budget
/acp help       # Show all commands
```

### Context Snapshots

Each transform saves a context snapshot for debugging:

```bash
# List all context snapshots for a session
ls ~/.config/opencode/logs/acp/context/<session-id>/

# View a specific snapshot (minimized format)
cat ~/.config/opencode/logs/acp/context/<session-id>/<timestamp>.json | jq .

# Find sessions with snapshots
ls ~/.config/opencode/logs/acp/context/
```

---

## Strategy Configuration

### Default Configuration (in `lib/config.ts`)

```typescript
{
  enabled: true,
  autoPruneAfterTool: true,
  strategies: {
    deduplication: { enabled: true },
    supersedeWrites: { enabled: true },
    purgeErrors: { enabled: true, minTurnsOld: 2 },
    truncation: {
      enabled: true,
      maxTokens: 2000,        // Truncate outputs larger than this
      headRatio: 0.4,         // Keep 40% from start
      tailRatio: 0.4,         // Keep 40% from end
      minTurnsOld: 2,         // Only truncate after 2 turns
      targetTools: ["read", "grep", "glob", "bash"]
    },
    thinkingCompression: {
      enabled: true,
      minTurnsOld: 3,         // Only compress after 3 turns
      maxTokens: 500          // Compress to ~500 tokens
    }
  }
}
```

### Customizing via opencode.json

Users can override defaults in their `opencode.json`:

```json
{
    "plugins": {
        "@tuanhung303/opencode-acp": {
            "strategies": {
                "truncation": {
                    "enabled": false
                },
                "thinkingCompression": {
                    "minTurnsOld": 5
                }
            }
        }
    }
}
```

---

## Architecture Overview

### Message Flow

```
User Message
    ↓
[system.prompt hook] → Inject ACP system prompt
    ↓
[chat.message.transform hook]
    ├── syncToolCache()           # Track all tools
    ├── injectHashesIntoToolOutputs()  # Add #x_xxxxx# prefixes
    ├── deduplicate()             # Remove duplicate reads
    ├── supersedeWrites()         # Keep only latest writes
    ├── purgeErrors()             # Remove old errors
    ├── truncateLargeOutputs()    # Head-tail truncation
    ├── compressThinkingBlocks()  # Compress old reasoning
    └── prune()                   # Apply agent's discard/extract
    ↓
LLM Response
    ↓
[tool.execute.after hook]
    ├── syncToolCache()
    ├── Run all strategies again
    └── sendUnifiedNotification() # Notify if pruned
```

### State Management

```typescript
interface SessionState {
  sessionId: string
  currentTurn: number
  prune: {
    toolIds: string[]           # Tools to prune
    extractions: Map<string, string>  # Extracted summaries
    softPruneCache: Map<string, any>  # For restore
  }
  toolParameters: Map<string, ToolParameterEntry>  # Tool metadata
  stats: {
    strategyStats: {
      deduplication: { count, tokens }
      supersedeWrites: { count, tokens }
      purgeErrors: { count, tokens }
      truncation: { count, tokens }
      thinkingCompression: { count, tokens }
    }
  }
}
```

---

## Future Improvements Roadmap

### Phase 1: Performance Quick Wins (v2.5.0)

**Estimated Effort: 2-3 days | Risk: Low**

| #   | Task                             | Impact | Effort | Description                                   |
| --- | -------------------------------- | ------ | ------ | --------------------------------------------- |
| 1.1 | **Convert prune arrays to Sets** | High   | 2h     | O(n) → O(1) lookups in hot paths              |
| 1.2 | **Add token count caching**      | Medium | 3h     | Cache `countTokens()` results by content hash |
| 1.3 | **Early exit optimizations**     | Medium | 2h     | Skip already-processed messages with WeakSet  |
| 1.4 | **Batch strategy execution**     | High   | 4h     | Single pass instead of 5 separate passes      |
| 1.5 | **Add performance metrics**      | Low    | 2h     | Track execution time per strategy             |

#### 1.1 Convert Prune Arrays to Sets

```typescript
// Current (O(n) per lookup)
interface PruneState {
    toolIds: string[]
    messagePartIds: string[]
}

// Proposed (O(1) per lookup)
interface PruneState {
    toolIds: Set<string>
    messagePartIds: Set<string>
}
```

**Files to modify**: `lib/state/types.ts`, `lib/state/state.ts`, `lib/messages/prune.ts`, `lib/strategies/*.ts`

#### 1.2 Token Count Caching

```typescript
// lib/strategies/utils.ts
const tokenCache = new Map<string, number>()
const MAX_CACHE_SIZE = 500

export function countTokens(text: string): number {
    if (!text) return 0

    // Use content hash for cache key (first 100 chars + length)
    const cacheKey = `${text.slice(0, 100)}:${text.length}`

    if (tokenCache.has(cacheKey)) {
        return tokenCache.get(cacheKey)!
    }

    const count = anthropicCountTokens(text)

    // LRU-style eviction
    if (tokenCache.size >= MAX_CACHE_SIZE) {
        const firstKey = tokenCache.keys().next().value
        tokenCache.delete(firstKey)
    }

    tokenCache.set(cacheKey, count)
    return count
}
```

#### 1.4 Batch Strategy Execution

```typescript
// Current: 5 separate passes over all messages
deduplicate(state, logger, config, messages)
supersedeWrites(state, logger, config, messages)
purgeErrors(state, logger, config, messages)
truncateLargeOutputs(state, logger, config, messages)
compressThinkingBlocks(state, logger, config, messages)

// Proposed: Single pass with strategy aggregator
interface StrategyContext {
    state: SessionState
    logger: Logger
    config: PluginConfig
    msg: WithParts
    part: MessagePart
    partIndex: number
    messageAge: number
}

type PartStrategy = (ctx: StrategyContext) => void

const partStrategies: PartStrategy[] = [
    deduplicatePart,
    supersedeWritesPart,
    purgeErrorsPart,
    truncatePart,
    compressThinkingPart,
]

// Single iteration
for (const msg of messages) {
    for (let i = 0; i < msg.parts.length; i++) {
        const ctx = { state, logger, config, msg, part: msg.parts[i], partIndex: i, messageAge }
        for (const strategy of partStrategies) {
            strategy(ctx)
        }
    }
}
```

---

### Phase 2: New Pruning Strategies (v2.6.0)

**Estimated Effort: 1-2 weeks | Risk: Medium**

| #   | Task                         | Impact    | Effort | Description                             |
| --- | ---------------------------- | --------- | ------ | --------------------------------------- |
| 2.1 | **Image/Base64 Pruning**     | Very High | 1d     | Remove base64 images after description  |
| 2.2 | **Stale Read Pruning**       | High      | 1d     | Prune file reads superseded by edits    |
| 2.3 | **Error Chain Collapse**     | Medium    | 4h     | Collapse repeated error attempts        |
| 2.4 | **Glob/Grep Result Pruning** | Medium    | 4h     | Prune search results after file is read |
| 2.5 | **Question Tool Pruning**    | Low       | 2h     | Prune question inputs, keep answers     |

#### 2.1 Image/Base64 Pruning Strategy

```typescript
// lib/strategies/image-pruning.ts
const BASE64_PATTERN = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]{1000,}/g
const IMAGE_PLACEHOLDER = "[Image removed to save context - see description above]"

export function pruneBase64Images(
    state: SessionState,
    logger: Logger,
    config: PluginConfig,
    messages: WithParts[],
): void {
    // Only prune images from messages older than N turns
    // Check if assistant has described the image in subsequent message
    // Replace base64 with placeholder
}
```

**Estimated savings**: 5,000-50,000 tokens per image

#### 2.2 Stale Read Pruning

```typescript
// When a file is edited, mark previous reads of that file as stale
// Prune stale reads after N turns

interface FileReadTracker {
    filePath: string
    callId: string
    turn: number
    supersededByEdit: boolean
}
```

#### 2.3 Error Chain Collapse

```typescript
// When same tool fails multiple times in a row:
// Keep: First error (shows initial problem)
// Keep: Last error (shows final state)
// Prune: Middle errors (redundant)

// Example: 5 failed edit attempts → keep 1st and 5th, prune 2-4
```

---

### Phase 3: Advanced Context Optimization (v3.0.0)

**Estimated Effort: 2-4 weeks | Risk: High**

| #   | Task                           | Impact    | Effort | Description                                 |
| --- | ------------------------------ | --------- | ------ | ------------------------------------------- |
| 3.1 | **Conversation Summarization** | Very High | 1w     | Summarize old turns with LLM                |
| 3.2 | **Semantic Deduplication**     | High      | 1w     | Detect similar (not identical) content      |
| 3.3 | **Adaptive Pruning**           | High      | 3d     | Adjust aggressiveness based on context size |
| 3.4 | **Code Block Minification**    | Medium    | 2d     | Strip comments/whitespace from old code     |
| 3.5 | **Cross-Session Caching**      | Medium    | 3d     | Cache common tool outputs across sessions   |

#### 3.1 Conversation Summarization

```typescript
// When context exceeds threshold:
// 1. Identify old turns (>10 turns ago)
// 2. Send to LLM for summarization
// 3. Replace original messages with summary
// 4. Mark as "compacted"

interface ConversationSummary {
    originalTurns: number[]
    summary: string
    tokensSaved: number
    createdAt: Date
}
```

#### 3.2 Semantic Deduplication

Use hashing/embeddings to detect semantically similar content (not just exact matches).

**Location:** Create `lib/strategies/semantic-dedup.ts`

#### 3.3 Adaptive Pruning

```typescript
interface AdaptivePruningConfig {
    // Context thresholds
    softLimit: number // 50k tokens - start gentle pruning
    hardLimit: number // 80k tokens - aggressive pruning
    criticalLimit: number // 95k tokens - emergency pruning

    // Aggressiveness levels
    levels: {
        gentle: { minTurnsOld: 5; truncateRatio: 0.3 }
        moderate: { minTurnsOld: 3; truncateRatio: 0.5 }
        aggressive: { minTurnsOld: 2; truncateRatio: 0.7 }
        emergency: { minTurnsOld: 1; truncateRatio: 0.9 }
    }
}
```

**Location:** Create `lib/strategies/adaptive.ts`

---

### Phase 4: Testing & Quality (Ongoing)

| #   | Task                               | Priority | Description                        |
| --- | ---------------------------------- | -------- | ---------------------------------- |
| 4.1 | **Add thinking-compression tests** | High     | Match truncation.test.ts coverage  |
| 4.2 | **Add integration tests**          | High     | End-to-end pruning scenarios       |
| 4.3 | **Add performance benchmarks**     | Medium   | Track regression in execution time |
| 4.4 | **Add memory profiling**           | Medium   | Ensure no memory leaks             |
| 4.5 | **Improve documentation**          | Low      | JSDoc for all public APIs          |

---

### Implementation Priority Matrix

```
                    HIGH IMPACT
                        │
    ┌───────────────────┼───────────────────┐
    │                   │                   │
    │  1.1 Set convert  │  2.1 Image prune  │
    │  1.4 Batch exec   │  3.1 Summarize    │
    │                   │  3.3 Adaptive     │
LOW ├───────────────────┼───────────────────┤ HIGH
EFFORT                  │                   EFFORT
    │  1.2 Token cache  │  3.2 Semantic     │
    │  1.3 Early exit   │  3.5 Cross-sess   │
    │  2.5 Question     │                   │
    │                   │                   │
    └───────────────────┼───────────────────┘
                        │
                    LOW IMPACT
```

---

### Recommended Release Roadmap

| Version    | Focus                                   | Timeline  |
| ---------- | --------------------------------------- | --------- |
| **v2.5.0** | Phase 1 (Performance)                   | 1 week    |
| **v2.6.0** | Phase 2.1-2.2 (Image + Stale Read)      | 1 week    |
| **v2.7.0** | Phase 2.3-2.5 (Error + Glob + Question) | 1 week    |
| **v3.0.0** | Phase 3 (Advanced)                      | 2-4 weeks |

---

## Implementation Checklist for New Strategies

1. [ ] Create strategy file in `lib/strategies/`
2. [ ] Add config interface in `lib/config.ts`
3. [ ] Add default config with `enabled: false`
4. [ ] Export from `lib/strategies/index.ts`
5. [ ] Call from `lib/hooks.ts` (both hooks)
6. [ ] Add strategy stats in `lib/state/types.ts`
7. [ ] Initialize stats in `lib/state/state.ts` (3 places)
8. [ ] Update `/acp stats` display in `lib/commands/stats.ts`
9. [ ] Write tests in `tests/strategies/`
10. [ ] Update this document
11. [ ] Test: `npm run build && npm link && opencode`

---

## Common Issues

### "Cannot discard: protected tool/file"

The tool or file is in the protected list. Check `/acp protected` or config.

### Notification still shows old format

The plugin needs to be reloaded. Restart OpenCode or start a new session.

### Auto-pruning not working

Check `autoPruneAfterTool` is `true` in config. Check debug logs.

### Strategies not triggering

1. Check if strategy is enabled in config
2. Check `minTurnsOld` - strategies wait before acting
3. Check logs for strategy-specific messages
4. Verify tool outputs meet size thresholds

### Truncation not working

- Requires outputs > 2000 tokens (configurable)
- Only affects: read, grep, glob, bash tools
- Must be 2+ turns old
- Check: `grep truncation ~/.config/opencode/logs/acp/daily/$(date +%Y-%m-%d).log`

### Thinking compression not working

- Requires extended thinking mode enabled
- Reasoning blocks must be > 500 tokens
- Must be 3+ turns old
- Check: `grep -i compress ~/.config/opencode/logs/acp/daily/$(date +%Y-%m-%d).log`

---

## Debug Commands

```bash
# View debug logs
cat ~/.config/opencode/logs/acp/daily/$(date +%Y-%m-%d).log | tail -100

# View context snapshots
ls ~/.config/opencode/logs/acp/context/

# Search logs for errors
grep -i error ~/.config/opencode/logs/acp/daily/$(date +%Y-%m-%d).log

# Search logs for specific strategy
grep -i "strategy_name" ~/.config/opencode/logs/acp/daily/$(date +%Y-%m-%d).log

# Count strategy activations today
grep -c "Truncated\|Compressed\|Deduplicated\|Superseded\|Purged" ~/.config/opencode/logs/acp/daily/$(date +%Y-%m-%d).log

# Check npm package version
npm view @tuanhung303/opencode-acp version

# Check local linked version
npm ls -g @tuanhung303/opencode-acp
```

---

## Publishing

```bash
# Ensure tests pass
npm test

# Build
npm run build

# Publish (requires npm login)
npm publish --access public

# Verify published version
npm view @tuanhung303/opencode-acp version
```

---

## Contact

- **Package:** `@tuanhung303/opencode-acp`
- **NPM:** https://www.npmjs.com/package/@tuanhung303/opencode-acp
- **Repository:** This repo
