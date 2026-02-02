export const PATTERN_FORMAT_DOC = `
- Pattern formats:
  - "start...end" → matches text that starts with "start" and ends with "end"
  - "start..."    → matches text that starts with "start"
  - "...end"      → matches text that ends with "end"
  - "exact"       → matches if text contains the string
- Matching is case-insensitive and ignores extra whitespace/newlines.
`
