# @tuanhung303/opencode-acp

## Installation

```bash
npm install @tuanhung303/opencode-acp
```

## Quick Start

Add to your OpenCode configuration:

```jsonc
// opencode.jsonc
{
    "plugin": ["@tuanhung303/opencode-acp@latest"],
}
```

Restart OpenCode to activate.

## Usage

### Manual Pruning

Use the `context` tool to manage conversation context:

```typescript
// Discard tool outputs
context({ action: "discard", targets: [["44136f"]] })

// Distill with summary
context({
    action: "distill",
    targets: [["01cb91", "Found 8 TypeScript files"]],
})

// Bulk operations
context({ action: "discard", targets: [["[tools]"]] })
context({ action: "discard", targets: [["[messages]"]] })
context({ action: "discard", targets: [["[*]"]] })
```

### Configuration

Create `.opencode/acp.jsonc`:

```jsonc
{
    "$schema": "https://raw.githubusercontent.com/opencode-acp/opencode-acp/master/acp.schema.json",
    "enabled": true,
    "autoPruneAfterTool": false,

    "tools": {
        "discard": { "enabled": true },
        "distill": { "enabled": true },
    },
}
```

## Features

- **Auto-Supersede**: Automatic deduplication of tool calls, file operations, and todo updates
- **Manual Pruning**: Explicit `discard` and `distill` tools for agent control
- **Bulk Operations**: Prune all tools, messages, or thinking blocks at once
- **Protected Tools**: Critical tools exempt from pruning
- **Token Savings**: Up to 50% reduction in context size

## API Reference

### context(options)

Main pruning interface.

**Parameters:**

- `action`: `"discard"` | `"distill"`
- `targets`: Array of `[hash]` or `[hash, summary]` tuples

**Target Types:**

- Tool outputs: 6 hex chars (e.g., `44136f`)
- Thinking blocks: 6 hex chars
- Messages: 6 hex chars
- Bulk patterns: `[tools]`, `[messages]`, `[thinking]`, `[*]`

### Commands

- `/acp context` - Show token usage
- `/acp stats` - Show pruning statistics
- `/acp sweep [n]` - Prune last N tools

## License

MIT
