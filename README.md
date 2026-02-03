# Agentic Context Pruning (ACP)

[![npm version](https://img.shields.io/npm/v/@tuanhung303/opencode-acp.svg)](https://www.npmjs.com/package/@tuanhung303/opencode-acp)

Automatically reduces token usage in OpenCode by intelligently managing conversation context.

## 🤖 Agent Auto

ACP exposes the `context` tool to manage conversation context efficiently.

```typescript
// Discard - remove completed/noisy content
context({ action: "discard", targets: [["r_a1b2c"], ["g_d4e5f"]] })

// Distill - replace with summaries
context({
    action: "distill",
    targets: [
        ["r_a1b2c", "Key finding"],
        ["Let me...", "Summary"],
    ],
})

// Restore - bring back pruned content
context({ action: "restore", targets: [["r_a1b2c"]] })
```

**Targets:**

| Type         | Format                  | Example                                              |
| ------------ | ----------------------- | ---------------------------------------------------- |
| Tool outputs | Hash `r_a1b2c`          | `r_abc12` (read), `g_def34` (glob), `t_56789` (task) |
| Messages     | Pattern `"start...end"` | `"Let me..."` (starts), `"...done"` (ends)           |

**When:**

- `discard` — Completed tasks, noise, redundant outputs
- `distill` — Large outputs to preserve as summaries
- `restore` — Bring back previously pruned content

## 🏗️ CI/CD Pipeline

ACP is maintained with a robust CI/CD pipeline:

- **CI**: Every Pull Request to `main` triggers automated linting, formatting checks, type checking, and unit tests to ensure code quality.
- **CD**: Successful merges to `main` automatically trigger version bumping, git tagging, and publishing to npm.

---

## ⏩ Just Skip Reading This Readme

### It's the Age of Agents

- **Just paste this link into Open Code and ask it to explain.**
- Ask why context pruning is important and how ACP helps save tokens.

```
Hey please read this readme and tell me why I should use ACP: https://raw.githubusercontent.com/tuanhung303/opencode-acp/master/README.md
```

## 👶 Context Pruning Features

ACP provides two modes of operation: **Agentic Pruning** (enabled by default) and **Auto-Pruning** (opt-in).

### Agentic vs Auto Pruning

| Mode        | Enabled by Default | Control                | Strategies                                                          |
| :---------- | :----------------- | :--------------------- | :------------------------------------------------------------------ |
| **Agentic** | ✅ Yes             | Explicit Agent Control | `context` (discard/distill/restore)                                 |
| **Auto**    | ❌ No              | Implicit/Automatic     | `deduplication`, `purgeErrors`, `truncation`, `thinkingCompression` |

#### 1. Agentic Pruning (LLM-Driven)

The AI identifies content it's "done" with and explicitly removes or summarizes it from the conversation history.

- **Discard** — Removes tool content without preservation (for completed tasks or noise).
- **Distill** — Replaces large chunks of text with concise summaries to keep the "vibe" without the token cost.

#### 2. Auto-Pruning (Heuristic-Driven)

ACP automatically spots patterns and applies pruning rules without agent intervention. **These are disabled by default to prevent unexpected context loss.**

- **Deduplication** — Automatically spots repeated calls (like reading the same file twice) and keeps only the most recent version.
- **Supersede Writes** — If a file is `write` and then `read`, the original write input is pruned because the read output is the current "truth."
- **Purge Errors** — Keeps the error message but removes the massive stack traces or large inputs that caused the crash after a few turns.
- **Truncation** — Automatically truncates very large tool outputs (e.g. from `read` or `bash`) if they exceed token limits.
- **Thinking Compression** — Compresses or removes large `<thinking>` blocks from older assistant messages.

### Safety Features

- **Todo Reminder** — Monitors `todowrite` usage. If the agent goes "rogue" without updating its list, it gets a nudge to refocus.
- **Automata Mode** — Autonomous reflection mechanism triggered by the keyword "automata". Injects strategic prompts to help agents stay on track and find optimizations.
- **Turn Protection** — A safety buffer that prevents any pruning for the last X messages.

## 🛠 Installation

### 👨‍💻 For Humans

Add to your OpenCode config:

```jsonc
// opencode.jsonc
{
    "plugin": ["@tuanhung303/opencode-acp@latest"],
}
```

Using `@latest` ensures you always get the newest version automatically when OpenCode starts. Restart OpenCode to begin.

### 🤖 For LLM Agents

Fetch this README and follow the instructions:

```bash
curl -s https://raw.githubusercontent.com/tuanhung303/opencode-acp/master/README.md
```

## How ACP Works

ACP hooks into OpenCode's message flow to intelligently reduce context size before sending to the LLM:

```mermaid
flowchart LR
    subgraph OpenCode["OpenCode Core"]
        direction TB
        A[User Message] --> B[Session]
        B --> C[Transform Hook]
        C --> D[toModelMessages]
        D --> E[LLM Provider]
    end

    subgraph ACP["ACP Plugin"]
        direction TB
        C --> F[syncToolCache]
        F --> G[injectHashes]
        G --> H[Apply Strategies]
        H --> I[prune]
        I --> C
    end

    %% Arctic Clarity Color Palette (Lightened)
    style OpenCode fill:#F4F7F9,stroke:#5A6B8A,stroke-width:1.5px,color:#1E2A36
    style ACP fill:#E8F5F2,stroke:#9AC4C0,stroke-width:1.5px,color:#1E2A36
    style A fill:#FAFCFD,stroke:#D0D8E0,stroke-width:1px,color:#2D3E50
    style B fill:#FAFCFD,stroke:#D0D8E0,stroke-width:1px,color:#2D3E50
    style C fill:#FAFCFD,stroke:#D0D8E0,stroke-width:1px,color:#2D3E50
    style D fill:#FAFCFD,stroke:#D0D8E0,stroke-width:1px,color:#2D3E50
    style E fill:#FAFCFD,stroke:#D0D8E0,stroke-width:1px,color:#2D3E50
    style F fill:#F5FAF9,stroke:#A8C9C5,stroke-width:1px,color:#1E2A36
    style G fill:#F5FAF9,stroke:#A8C9C5,stroke-width:1px,color:#1E2A36
    style H fill:#F5FAF9,stroke:#A8C9C5,stroke-width:1px,color:#1E2A36
    style I fill:#F5FAF9,stroke:#A8C9C5,stroke-width:1px,color:#1E2A36
```

ACP uses multiple tools and strategies to reduce context size:

### Tools

**Discard** — Exposes a `discard` tool that the AI can call to remove completed or noisy tool content from context.

**Distill** — Exposes a `distill` tool that the AI can call to distill valuable context into concise summaries before removing the tool content.

### Strategies

**Deduplication** — Detects repeated tool calls with identical arguments (e.g., reading the same file multiple times) and retains only the most recent output. Earlier duplicates are replaced with lightweight placeholders. Runs automatically on every request with zero LLM cost.

**Supersede Writes** — Prunes `write` tool inputs when the same file has been subsequently `read`. The write content becomes redundant because the read output captures the current file state. Runs automatically on every request with zero LLM cost.

**Purge Errors** — Removes tool inputs for failed tool calls after a configurable turn threshold (default: 4). Error messages are preserved for debugging context, but potentially large input payloads are stripped. Runs automatically on every request with zero LLM cost.

**Todo Reminder** — Tracks `todowrite` activity and injects reminders when the agent neglects its task list. Helps maintain focus during long sessions by prompting the agent to review and update pending tasks.

> **Non-destructive:** Your session history is never modified. ACP replaces pruned content with placeholders only in the request sent to your LLM.

## Impact on Prompt Caching

LLM providers cache prompts using **exact prefix matching**—the KV (Key-Value) cache is reused only when the beginning of a new prompt is byte-for-byte identical to a cached prompt. Even a single character change invalidates the cache from that point forward.

| Provider  | Mechanism          | Min Tokens  | TTL       | Cache Discount |
| :-------- | :----------------- | :---------- | :-------- | :------------- |
| Anthropic | Manual breakpoints | 1,024–3,000 | ~5 min    | ~90% off       |
| OpenAI    | Automatic          | 1,024       | ~5–10 min | ~50% off       |

When ACP prunes a tool output mid-conversation, it changes message content and invalidates cached prefixes from that point forward.

**Trade-off:** You lose some cache read benefits but gain larger token savings from reduced context size and improved response quality through reduced context poisoning. In most cases, the token savings outweigh the cache miss cost—especially in long sessions where context bloat becomes significant.

> **Note:** In testing, cache hit rates were approximately 65% with ACP enabled vs 85% without.

**Best use case:** Providers that charge per-request (e.g., GitHub Copilot, Google Antigravity) see no negative price impact from cache invalidation.

## Configuration

ACP uses its own config file:

- Global: `~/.config/opencode/acp.jsonc` (or `acp.json`), created automatically on first run
- Custom config directory: `$OPENCODE_CONFIG_DIR/acp.jsonc` (or `acp.json`), if `OPENCODE_CONFIG_DIR` is set
- Project: `.opencode/acp.jsonc` (or `acp.json`) in your project's `.opencode` directory

<details>
<summary><strong>Default Configuration</strong> (click to expand)</summary>

```jsonc
{
    "$schema": "https://raw.githubusercontent.com/opencode-acp/opencode-acp/master/acp.schema.json",
    // Enable or disable the plugin
    "enabled": true,
    // Automatically run pruning after each tool execution (Default: false)
    "autoPruneAfterTool": false,
    // Notification display: "off", "minimal", or "detailed"
    "pruneNotification": "minimal",
    // Slash commands configuration
    "commands": {
        "enabled": true,
        "protectedTools": [],
    },
    // LLM-driven context pruning tools (Enabled by default)
    "tools": {
        "discard": { "enabled": true },
        "distill": { "enabled": true },
        "todoReminder": { "enabled": true },
        "automataMode": { "enabled": true },
    },
    // Automatic pruning strategies (Disabled by default - Opt-in)
    "strategies": {
        "deduplication": { "enabled": false },
        "purgeErrors": { "enabled": false },
        "truncation": { "enabled": false },
        "thinkingCompression": { "enabled": false },
        "supersedeWrites": { "enabled": false },
    },
}
```

</details>

### Opt-In Configuration

To enable all automatic pruning strategies, use the following configuration:

```jsonc
{
    "$schema": "https://raw.githubusercontent.com/opencode-acp/opencode-acp/master/acp.schema.json",
    "autoPruneAfterTool": true,
    "strategies": {
        "deduplication": { "enabled": true },
        "purgeErrors": { "enabled": true, "turns": 4 },
        "truncation": { "enabled": true, "maxTokens": 2000 },
        "thinkingCompression": { "enabled": true, "minTurnsOld": 3 },
    },
}
```

### Commands

ACP exposes a `/acp` slash command with the following subcommands:

| Command          | Description                                                                                                                      |
| :--------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| `/acp`           | Lists available ACP commands                                                                                                     |
| `/acp context`   | Displays token usage breakdown by category (system, user, assistant, tools) and cumulative savings from pruning                  |
| `/acp stats`     | Shows aggregate pruning statistics across all sessions                                                                           |
| `/acp sweep [n]` | Prunes all tool outputs since the last user message. Optional `n` limits to the last N tools. Respects `commands.protectedTools` |

### Turn Protection

Prevents tool outputs from being pruned for a configurable number of message turns. This buffer ensures the agent can reference recent outputs before they become eligible for pruning. Applies to both manual tools (`discard`, `distill`) and automatic strategies.

### Todo Reminder

Monitors `todowrite` activity and injects reminders when the agent neglects its task list:

| Setting        | Default | Description                               |
| :------------- | :------ | :---------------------------------------- |
| `initialTurns` | 12      | Turns of inactivity before first reminder |
| `repeatTurns`  | 6       | Interval between subsequent reminders     |

- Reminders are prunable like any other content
- Only triggers when `pending` or `in_progress` todos exist
- Resets on `todowrite` calls (`todoread` alone does not reset)

### Automata Mode

An autonomous reflection mechanism that triggers when the user's prompt contains "automata" (case-insensitive). Once active, it periodically injects strategic prompts (after `initialTurns` of continuous work).

| Setting        | Default | Description                           |
| :------------- | :------ | :------------------------------------ |
| `enabled`      | true    | Enable automata mode injection        |
| `initialTurns` | 8       | Turns of work before first reflection |

- Prompt sections: Review Progress, Discover Objectives, Re-prioritize, Suggest Optimizations
- Automatically replaces previous reflection with new ones
- Clears on `todowrite` actions (acknowledging the reflection)

### Protected Tools

These tools are always exempt from pruning across all strategies:

```
task, todowrite, todoread, discard, distill, batch, write, edit, plan_enter, plan_exit
```

Additional tools can be protected via `protectedTools` arrays in each config section.

### Config Precedence

Settings merge in priority order (later overrides earlier):

```
Defaults → Global (~/.config/opencode/acp.jsonc) → Config Dir ($OPENCODE_CONFIG_DIR/acp.jsonc) → Project (.opencode/acp.jsonc)
```

Restart OpenCode after modifying configuration.

## Limitations

**Subagents** — ACP is disabled for subagents. Subagent sessions prioritize returning concise summaries to the main agent over token efficiency. Pruning could interfere with this summarization behavior.

## License

MIT
