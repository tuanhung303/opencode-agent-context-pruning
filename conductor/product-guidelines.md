# Product Guidelines

## Tone and Style

### Communication Style

- **Technical and Precise**: Focus on accuracy and detailed specifications. Technical correctness is paramount.
- **Friendly and Approachable**: Make complex concepts accessible without sacrificing technical depth. Avoid overly academic or rigid language.

### Writing Principles

- Use clear, concise language
- Explain the "what", "why", and "how" for every feature
- Provide real-world scenarios to illustrate abstract concepts
- Balance technical depth with readability

## Visual and Branding Guidelines

### Design Philosophy

- **Clean and Minimal**: Focus on readability and clarity. Avoid visual clutter.
- **Structured Data**: Use tables consistently for configuration options, feature comparisons, and reference material
- **Code-First**: All code examples must be syntax-highlighted and copy-paste ready

### Documentation Structure

- **Concise README**: Keep the main README focused on quick start and key features
- **Detailed Documentation**: Move in-depth documentation to separate files (docs/, conductor/)
- **Progressive Disclosure**: Organize content from basic to advanced

## Content Guidelines

### Feature Documentation

Every feature must include:

1. **What**: Clear description of what the feature does
2. **Why**: The problem it solves and value it provides
3. **How**: Usage instructions with practical examples

### Configuration Documentation

- Include complete, working configuration examples
- Explain every option with its default value and valid range
- Provide both minimal and full configuration templates

### Examples and Scenarios

- Use real-world scenarios that users can relate to
- Include before/after comparisons where applicable
- Show both simple and advanced use cases

## Code Guidelines

### Language and Standards

- **TypeScript**: All code must be written in TypeScript
- **Strict Type Checking**: Enable and enforce strict type checking (`strict: true` in tsconfig)
- **Modern JavaScript**: Target ES2022 with ESNext modules

### Code Patterns

- **Follow Existing Conventions**: Match the patterns and style already established in the codebase
- **Consistency**: Maintain consistency with existing file structure, naming conventions, and architectural patterns
- **Plugin Architecture**: Respect the OpenCode plugin interface and lifecycle hooks

### Quality Standards

- Type safety is non-negotiable
- Use explicit types over inferred types for public APIs
- Document complex type definitions

## Versioning and Compatibility

### Backward Compatibility

- Changes must not break backward compatibility without a major version bump
- Deprecate features gracefully with clear migration paths
- Maintain configuration format stability within major versions

### Breaking Changes

When breaking changes are necessary:

1. Document the change clearly in CHANGELOG.md
2. Provide migration guide
3. Update major version number
4. Maintain deprecated features with warnings for at least one minor version
