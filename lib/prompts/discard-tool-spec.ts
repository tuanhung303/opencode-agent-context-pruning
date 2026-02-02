export default `
Removes tool outputs from the conversation context to manage size and focus.

## How It Works
Tool outputs are prefixed with hash identifiers like "r_a1b2c". Use these to remove specific outputs.

## Parameters
- hashes: Array of hash strings (e.g., ["r_a1b2c", "g_d4e5f"])

## Examples
discard_tool(["r_a1b2c", "g_d4e5f"])
`
