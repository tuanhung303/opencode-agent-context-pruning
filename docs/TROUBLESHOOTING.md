# Troubleshooting

---

## Error: `reasoning_content is missing` (400 Bad Request)

**Cause:** Using Anthropic/DeepSeek/Kimi thinking mode with an outdated ACP version or missing reasoning sync.

**Fix:**

1. Update to ACP v3.0.0+: `npm install @tuanhung303/opencode-acp@latest`
2. Ensure your config has thinking-compatible settings
3. See [Known Pitfalls](../README.md#-known-pitfalls-for-agents) for detailed code examples

---

## Plugin Not Loading

**Symptoms:** Commands like `/acp` return "Unknown command"

**Fix:**

1. Verify plugin is in `opencode.jsonc`: `"plugin": ["@tuanhung303/opencode-acp@latest"]`
2. Run `npm run build && npm link` in the plugin directory
3. Restart OpenCode

---

## High Token Usage Despite ACP

**Check:**

- Is aggressive pruning enabled in config? See [Configuration](CONFIGURATION.md)
- Are you using protected tools excessively? (`task`, `write`, `edit` can't be pruned)
- Is your session >100 turns? Consider starting a fresh session

---

## Limitations

- **Subagents**: ACP is disabled for subagent sessions
- **Cache Invalidation**: Pruning mid-conversation invalidates prompt caches
- **Protected Tools**: Some tools cannot be pruned by design

---

← Back to [README](../README.md)
