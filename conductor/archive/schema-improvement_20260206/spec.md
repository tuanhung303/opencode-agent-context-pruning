# Specification: JSON Schema and Zod Definition Improvement

## 1. Overview

This track focuses on reviewing, updating, and synchronizing the plugin's configuration schemas. The primary goals are to ensure that the external JSON schema (`acp.schema.json`) and the internal runtime Zod definitions (`lib/config/schema.ts` or similar) are fully aligned with the current codebase capabilities, including any recently added features. Additionally, the schemas will be enhanced with comprehensive descriptions to improve the developer experience (DX) and provide better IDE hints.

## 2. Functional Requirements

- **Audit & Discovery:**
    - Analyze `defaultConfig` and usage in `lib/config/` to identify all currently supported configuration options.
    - Compare findings against `acp.schema.json` and Zod definitions to identify missing fields.
- **Schema Synchronization:**
    - Update Zod definitions to include any missing configuration fields found during the audit.
    - Update `acp.schema.json` to reflect the Zod definitions and the actual code capabilities.
- **Documentation Enhancement:**
    - Add clear, descriptive help text (using the `description` field) to all properties in both the Zod schema (via `.describe()`) and the JSON schema.
    - Ensure descriptions explain the behavior of the setting and its default value.

## 3. Non-Functional Requirements

- **Consistency:** The JSON schema and Zod validation must match strictly in terms of types, defaults, and structure.
- **Maintainability:** Where possible, structure the schemas to make future updates easier (e.g., matching the code structure).

## 4. Acceptance Criteria

- [ ] A comprehensive audit of configuration options is completed.
- [ ] `acp.schema.json` contains all configuration options present in the code.
- [ ] Internal Zod definitions contain all configuration options present in the code.
- [ ] All schema fields have meaningful descriptions/help text.
- [ ] `npm run test` passes, confirming that schema changes do not break existing config loading logic.
- [ ] (Optional) A manual check confirms that the JSON schema provides correct intellisense in an IDE (e.g., by validating a dummy config file).

## 5. Out of Scope

- Refactoring the configuration loading logic itself (unless necessary to support the schema).
- Adding new configuration features (this track is for documenting/validating _existing_ features).
