# Configuration

ACP uses its own config file with layered priority:

```
Priority: Defaults → Global → Config Dir → Project
```

| Level          | Path                             |
| -------------- | -------------------------------- |
| **Global**     | `~/.config/opencode/acp.jsonc`   |
| **Config Dir** | `$OPENCODE_CONFIG_DIR/acp.jsonc` |
| **Project**    | `.opencode/acp.jsonc`            |

---

## Default Configuration

```jsonc
{
    "$schema": "https://raw.githubusercontent.com/tuanhung303/opencode-agent-context-pruning/master/acp.schema.json",
    "enabled": true,
    "debug": false,
    "pruneNotification": "minimal",

    "commands": {
        "enabled": true,
        "protectedTools": [], // Additional tools to protect (merged with defaults)
    },

    "protectedFilePatterns": [
        "**/.env",
        "**/.env.*",
        "**/credentials.json",
        "**/secrets.json",
        "**/*.pem",
        "**/*.key",
        "**/package.json",
        "**/tsconfig.json",
        "**/pyproject.toml",
        "**/Cargo.toml",
    ],

    "tools": {
        "settings": {
            "protectedTools": [],
            "enableAssistantMessagePruning": true,
            "enableReasoningPruning": true,
            "enableVisibleAssistantHashes": true,
        },
        "discard": { "enabled": true },
        "distill": { "enabled": true, "showDistillation": false },
        "todoReminder": {
            "enabled": true,
            "initialTurns": 5,
            "repeatTurns": 4,
            "stuckTaskTurns": 12,
        },
        "automataMode": { "enabled": true, "initialTurns": 8 },
    },

    "strategies": {
        "purgeErrors": { "enabled": false, "turns": 4 },
        "aggressivePruning": {
            // All enabled by default - see Aggressive Pruning section
        },
    },
}
```

---

## Protected Tools

These tools are exempt from pruning to ensure operational continuity:

```
context_info, task, todowrite, todoread, context_prune, batch, write, edit, plan_enter, plan_exit
```

Add your own:

```jsonc
{
    "commands": {
        "protectedTools": ["my_custom_tool"],
    },
}
```

---

## Aggressive Pruning Presets

Use presets for quick configuration:

```jsonc
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

### Individual Flags

Override preset values with individual flags:

```jsonc
{
    "strategies": {
        "aggressivePruning": {
            "preset": "balanced",
            "pruneToolInputs": true, // Strip verbose inputs on supersede
            "pruneStepMarkers": true, // Remove step markers entirely
            "pruneSourceUrls": true, // Dedup URL fetches
            "pruneFiles": true, // Mask file attachments
            "pruneSnapshots": true, // Keep only latest snapshot
            "pruneRetryParts": true, // Prune failed retries on success
            "pruneUserCodeBlocks": false, // Keep user code blocks (balanced default)
            "truncateOldErrors": false, // Keep full errors (balanced default)
            "aggressiveFilePrune": true, // One-file-one-view
            "stateQuerySupersede": true, // Dedup state queries (ls, git status)
        },
    },
}
```

---

## Todo Reminder

Monitors `todowrite` usage and prompts when tasks are neglected:

```jsonc
{
    "tools": {
        "todoReminder": {
            "enabled": true,
            "initialTurns": 8, // First reminder after 8 turns without todo update
            "repeatTurns": 4, // Subsequent reminders every 4 turns
            "stuckTaskTurns": 12, // Threshold for stuck task detection
        },
    },
}
```

**Behavior:**

- **First reminder**: Fires after `initialTurns` (8) turns without `todowrite`
- **Repeat reminders**: Fire every `repeatTurns` (4) turns thereafter
- **Auto-reset**: Each `todowrite` call resets the counter to 0
- **Deduplication**: Only ONE reminder exists in context at a time; new reminders replace old ones
- **Stuck task detection**: Tasks in `in_progress` for `stuckTaskTurns` (12) are flagged with guidance
- **Prunable outputs**: Reminder displays a list of prunable tool outputs to help with cleanup

**Reminder Sequence:**

```
Turn 0:  todowrite() called (resets counter)
Turn 8:  🔖 First reminder (if no todowrite since turn 0)
Turn 12: 🔖 Repeat reminder
Turn 16: 🔖 Repeat reminder
...
```

---

## Automata Mode

Autonomous reflection triggered by "automata" keyword:

```jsonc
{
    "tools": {
        "automataMode": {
            "enabled": true,
            "initialTurns": 8, // Turns before first reflection
        },
    },
}
```

---

## Commands

| Command      | Description                     |
| ------------ | ------------------------------- |
| `/acp`       | Show ACP statistics and version |
| `/acp stats` | Show ACP statistics and version |

---

← Back to [README](../README.md)
