export default `
Manages conversation context by removing, summarizing, or restoring content.

## Actions
- **discard**: Remove content entirely from context
- **distill**: Replace content with a summary
- **restore**: Bring back previously removed content

## Targets Format
Targets are provided as tuples: [[target, summary?], ...]

### Target Types (Auto-detected)
- **Tool outputs**: Use hash identifiers (e.g., r_a1b2c, g_d4e5f, t_12345)
  - Format: letter_5hexchars (e.g., r_a1b2c)
  - First char is tool prefix (r=read, g=glob, t=task, etc.)
- **Messages**: Use pattern strings to match assistant message content
  - Format: "start...end" matches text starting with 'start' AND ending with 'end'
  - Format: "start..." matches text starting with 'start'
  - Format: "...end" matches text ending with 'end'

## Parameters
- action: "discard" | "distill" | "restore"
- targets: Array of [target] or [target, summary] tuples
  - For discard/restore: [[target], [target], ...]
  - For distill: [[target, summary], [target, summary], ...]

## Examples

### Discard
Remove a file read and a message:
context({ 
  action: "discard", 
  targets: [["r_a1b2c"], ["Let me explain...architecture"]] 
})

### Distill
Replace content with summaries:
context({ 
  action: "distill", 
  targets: [
    ["r_a1b2c", "auth.ts: JWT validation in validateToken()"],
    ["Let me explain...", "Explained auth flow"]
  ] 
})

### Restore (Symmetric)
Restore using same identifiers used to discard:
context({ 
  action: "restore", 
  targets: [["r_a1b2c"], ["Let me explain...architecture"]] 
})
`
