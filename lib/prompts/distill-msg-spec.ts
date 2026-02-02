import { PATTERN_FORMAT_DOC } from "./shared/pattern-format"

export default `
Distills assistant messages into condensed summaries, then removes raw content.

## How It Works
Uses pattern matching to identify messages, then replaces them with summaries.

${PATTERN_FORMAT_DOC}

## Parameters
- entries: Array of [pattern, replace_content] tuples

## Examples
distill_msg([
  ["Let me explain...", "Explained auth architecture"],
  ["Here's the plan...", "Outlined implementation steps"]
])
`
