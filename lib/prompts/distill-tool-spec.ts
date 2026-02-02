export default `
Distills tool outputs into condensed knowledge, then removes raw outputs.

## How It Works
Tool outputs are prefixed with hash identifiers like "r_a1b2c". Replace them with summaries.

## Parameters
- entries: Array of [hash, replace_content] tuples

## Examples
distill_tool([
  ["r_a1b2c", "auth.ts: validateToken() checks JWT..."],
  ["r_d4e5f", "user.ts: interface User { id, email, permissions }"]
])
`
