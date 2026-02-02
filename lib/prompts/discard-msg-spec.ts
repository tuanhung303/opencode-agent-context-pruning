import { PATTERN_FORMAT_DOC } from "./shared/pattern-format"

export default `
Removes assistant message parts from the conversation context to manage size and focus.

## How It Works
Uses pattern matching to identify and remove specific message parts.

${PATTERN_FORMAT_DOC}

## Parameters
- patterns: Array of pattern strings (e.g., ["Let me explain...", "...completed"])

## Examples
discard_msg(["Let me explain...", "...completed"])
`
