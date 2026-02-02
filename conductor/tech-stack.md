# Technology Stack

## Core Technologies

### Programming Language

- **TypeScript 5.9+**: Primary development language
    - Target: ES2022
    - Module System: ESNext
    - Strict type checking enabled
    - Declaration files generated for distribution

### Runtime Environment

- **Node.js**: Target platform for OpenCode plugin execution
- **OpenCode Plugin API**: Peer dependency `@opencode-ai/plugin >=0.13.7`

## Build and Development Tools

### Build System

- **TypeScript Compiler (tsc)**: Direct compilation without bundler
    - Output: `./dist/` directory
    - Source maps and declaration maps enabled
    - Cleans output directory before build

### Package Management

- **npm**: Package manager and script runner
- **Distribution**: Published to npm registry as `@tuanhung303/opencode-acp`

## Testing Framework

### Test Runner

- **Vitest 4.0+**: Modern Vite-based test runner
    - Unit tests in `tests/` directory
    - Watch mode support for development
    - TypeScript support out of the box

## Code Quality Tools

### Linting

- **ESLint 9+**: JavaScript/TypeScript linting
    - `@eslint/js`: Core ESLint rules
    - `typescript-eslint`: TypeScript-specific rules
    - Custom configuration in `eslint.config.js`

### Formatting

- **Prettier 3.4+**: Code formatting
    - Configuration in `.prettierrc`
    - Scripts: `format` and `format:check`

## Key Dependencies

### Runtime Dependencies

| Package                   | Version | Purpose                                 |
| ------------------------- | ------- | --------------------------------------- |
| `@anthropic-ai/tokenizer` | ^0.0.4  | Token counting for truncation strategy  |
| `@opencode-ai/sdk`        | ^1.1.3  | OpenCode SDK integration                |
| `jsonc-parser`            | ^3.3.1  | Parse JSON with comments (config files) |
| `zod`                     | ^4.1.13 | Schema validation and type safety       |

### Development Dependencies

| Package               | Version  | Purpose                               |
| --------------------- | -------- | ------------------------------------- |
| `@opencode-ai/plugin` | ^1.0.143 | OpenCode plugin API (peer dependency) |
| `@types/node`         | ^24.10.1 | Node.js type definitions              |
| `tsx`                 | ^4.21.0  | TypeScript execution for development  |

## Project Structure

```
/
├── index.ts              # Plugin entry point
├── lib/                  # Source code
│   ├── config/           # Configuration management
│   ├── messages/         # Message pruning logic
│   ├── strategies/       # Pruning strategies
│   ├── state/            # Session state management
│   ├── prompts/          # System prompt injection
│   ├── commands/         # Slash command handlers
│   ├── ui/               # Notification UI
│   ├── utils/            # Shared type-safe utilities
│   └── *.ts              # Core utilities
├── tests/                # Test files
├── dist/                 # Compiled output (gitignored)
├── docs/                 # Documentation
├── conductor/            # Conductor project management
├── package.json          # Package manifest
├── tsconfig.json         # TypeScript configuration
└── acp.schema.json       # JSON Schema for config validation
```

## Configuration Files

### TypeScript Configuration

- `tsconfig.json`: Main compiler configuration
    - Strict mode enabled
    - Module resolution: bundler
    - Includes: `index.ts`, `lib/**/*`
    - Excludes: `node_modules`, `dist`, `logs`

### Package Configuration

- `package.json`: Scripts, dependencies, metadata
    - Type: "module" (ES modules)
    - Main: `./dist/index.js`
    - Types: `./dist/index.d.ts`

## Plugin Architecture

### OpenCode Integration

- Implements OpenCode plugin interface
- Uses lifecycle hooks:
    - `system.prompt`: Inject system prompts
    - `tool.execute.after`: Post-tool execution pruning
    - `chat.message.transform`: Pre-inference message transformation

### State Management

- Session-based state persistence
- Tool parameter caching
- Pruning decision tracking

## Development Workflow

### Available Scripts

```bash
npm run build       # Clean and compile TypeScript
npm run dev         # Development mode with OpenCode
npm run test        # Run all tests
npm run test:watch  # Run tests in watch mode
npm run lint        # Run ESLint
npm run lint:fix    # Fix ESLint issues
npm run format      # Format with Prettier
npm run format:check # Check formatting
```

### Distribution

- Compiled to `dist/` directory
- Includes: `.js`, `.d.ts`, `.d.ts.map`, `.js.map` files
- Published files: `dist/`, `README.md`, `LICENSE`
