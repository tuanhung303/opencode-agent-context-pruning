# TypeScript Code Style Guide

## General Principles

- **Strict TypeScript**: Enable all strict mode options
- **Explicit over Implicit**: Prefer explicit types for public APIs
- **Readability First**: Code is read more often than written
- **Consistency**: Follow existing patterns in the codebase

## TypeScript Configuration

### Required Compiler Options

```json
{
    "compilerOptions": {
        "strict": true,
        "noUncheckedIndexedAccess": true,
        "exactOptionalPropertyTypes": true,
        "noImplicitReturns": true,
        "noFallthroughCasesInSwitch": true,
        "forceConsistentCasingInFileNames": true
    }
}
```

## Naming Conventions

### Files

- Use `kebab-case.ts` for file names
- Test files: `*.test.ts`
- Type definition files: `*.d.ts`

### Variables and Functions

- `camelCase` for variables, functions, methods
- `PascalCase` for classes, interfaces, types, enums
- `SCREAMING_SNAKE_CASE` for constants
- `camelCase` for object properties

### Types and Interfaces

- Prefer `interface` over `type` for object shapes
- Use `type` for unions, intersections, and complex types
- Prefix interfaces with `I` only when necessary for clarity

## Type Safety

### Explicit Types

```typescript
// Good - explicit return type
function calculateTotal(items: Item[]): number {
    return items.reduce((sum, item) => sum + item.price, 0)
}

// Bad - implicit return type
function calculateTotal(items: Item[]) {
    return items.reduce((sum, item) => sum + item.price, 0)
}
```

### Null Safety

```typescript
// Good - handle null/undefined
function getUserName(user: User | undefined): string {
    return user?.name ?? "Anonymous"
}

// Bad - potential null reference
function getUserName(user: User | undefined): string {
    return user.name // Error if user is undefined
}
```

### Avoid `any`

```typescript
// Good - use unknown and type guard
function processData(data: unknown): void {
    if (typeof data === "string") {
        console.log(data.toUpperCase())
    }
}

// Bad - using any
function processData(data: any): void {
    console.log(data.toUpperCase())
}
```

## Functions

### Function Declarations

- Use function declarations for named functions
- Use arrow functions for callbacks and methods
- Explicitly type parameters and return values

```typescript
// Good
function formatDate(date: Date): string {
    return date.toISOString()
}

// Good - arrow function for callback
const items = data.map((item) => item.name)

// Bad - implicit types
const formatDate = (date) => date.toISOString()
```

### Async Functions

- Always return `Promise<T>` explicitly
- Use `async/await` over raw promises
- Handle errors with try/catch

```typescript
// Good
async function fetchUser(id: string): Promise<User> {
    try {
        const response = await api.get(`/users/${id}`)
        return response.data
    } catch (error) {
        throw new Error(`Failed to fetch user: ${error}`)
    }
}
```

## Classes

### Class Structure

```typescript
class Example {
    // Properties first
    private readonly id: string
    public name: string

    // Constructor
    constructor(id: string, name: string) {
        this.id = id
        this.name = name
    }

    // Public methods
    public getId(): string {
        return this.id
    }

    // Private methods
    private validate(): boolean {
        return this.name.length > 0
    }
}
```

### Access Modifiers

- Always specify access modifiers (`public`, `private`, `protected`)
- Use `readonly` for immutable properties
- Prefer private fields (`#field`) for true encapsulation when needed

## Error Handling

### Custom Errors

```typescript
class ConfigurationError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "ConfigurationError"
    }
}
```

### Error Patterns

```typescript
// Good - specific error handling
function parseConfig(json: string): Config {
    try {
        return JSON.parse(json)
    } catch (error) {
        throw new ConfigurationError(`Invalid JSON: ${error}`)
    }
}

// Good - type guard for error
try {
    await operation()
} catch (error) {
    if (error instanceof ConfigurationError) {
        logger.error("Config error:", error.message)
    } else {
        throw error
    }
}
```

## Imports and Exports

### Import Organization

```typescript
// 1. External dependencies
import { z } from "zod"

// 2. Internal absolute imports
import { Config } from "@/lib/config"

// 3. Internal relative imports
import { utils } from "./utils"
```

### Export Patterns

```typescript
// Good - explicit exports
export interface PluginConfig {
    enabled: boolean
}

export class Plugin {
    // implementation
}

export function createPlugin(): Plugin {
    return new Plugin()
}

// Good - barrel exports
export * from "./config"
export { default as Config } from "./config"
```

## Comments and Documentation

### JSDoc Comments

```typescript
/**
 * Prunes tool outputs from the conversation context.
 *
 * @param state - The current session state
 * @param messages - Array of conversation messages
 * @returns The number of pruned outputs
 * @throws {ConfigurationError} If pruning configuration is invalid
 *
 * @example
 * const count = pruneOutputs(state, messages);
 * console.log(`Pruned ${count} outputs`);
 */
function pruneOutputs(state: SessionState, messages: Message[]): number {
    // implementation
}
```

### Inline Comments

- Use inline comments sparingly
- Explain "why", not "what"
- Keep comments up-to-date with code changes

```typescript
// Good - explains why
// Disable auto-pruning by default to give users explicit control
const autoPruneAfterTool = false

// Bad - explains what (obvious from code)
// Set autoPruneAfterTool to false
const autoPruneAfterTool = false
```

## Testing

### Test Structure

```typescript
import { describe, it, expect } from "vitest"
import { prune } from "./prune"

describe("prune", () => {
    it("should remove specified tool outputs", () => {
        // Arrange
        const state = createMockState()
        const messages = createMockMessages()

        // Act
        const result = prune(state, messages)

        // Assert
        expect(result.prunedCount).toBe(2)
    })

    it("should handle empty message array", () => {
        const state = createMockState()
        const result = prune(state, [])
        expect(result.prunedCount).toBe(0)
    })
})
```

### Test Naming

- Use descriptive test names
- Follow `should [expected behavior] when [condition]` pattern
- Group related tests with `describe` blocks

## Configuration and Constants

### Constants

```typescript
// Good - grouped constants
const DEFAULT_CONFIG = {
    ENABLED: true,
    MAX_TOKENS: 2000,
    HEAD_RATIO: 0.4,
    TAIL_RATIO: 0.4,
} as const

// Good - type-safe config
interface Config {
    enabled: boolean
    maxTokens: number
}

const defaultConfig: Config = {
    enabled: true,
    maxTokens: 2000,
}
```

## Performance Considerations

### Avoid Unnecessary Allocations

```typescript
// Good - reuse array
const results: string[] = []
for (const item of items) {
    results.push(process(item))
}

// Bad - creating arrays in loop
for (const item of items) {
    const results = [...results, process(item)]
}
```

### Type Guards

```typescript
// Good - proper type guard
function isConfig(obj: unknown): obj is Config {
    return (
        typeof obj === "object" &&
        obj !== null &&
        "enabled" in obj &&
        typeof (obj as Config).enabled === "boolean"
    )
}

if (isConfig(data)) {
    // data is typed as Config here
    console.log(data.enabled)
}
```
