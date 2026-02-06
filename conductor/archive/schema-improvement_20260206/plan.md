# Plan: JSON Schema and Zod Definition Improvement

## Phase 1: Audit and Analysis

- [ ] Task: Audit Configuration Codebase
    - [ ] Scan `lib/config/` and `defaultConfig` to list all active configuration options.
    - [ ] Identify `prune_behavior` and `aggressive_pruning` settings specifically.
- [ ] Task: Compare with Schemas
    - [ ] Check `acp.schema.json` for missing fields found in the audit.
    - [ ] Check internal Zod definitions for missing fields.
    - [ ] Create a list of discrepancies to address.
- [ ] Task: Conductor - User Manual Verification 'Audit and Analysis' (Protocol in workflow.md)

## Phase 2: Schema Synchronization

- [ ] Task: Update Zod Definitions
    - [ ] Write/Update unit tests for config validation to cover new fields (TDD).
    - [ ] Add missing fields to the Zod schema in `lib/config/`.
    - [ ] Add `.describe()` calls to all Zod fields with clear documentation.
- [ ] Task: Update JSON Schema
    - [ ] Update `acp.schema.json` to match the enhanced Zod definitions.
    - [ ] Ensure all fields in `acp.schema.json` have a `description` property.
    - [ ] Verify structure matches the code's expected config shape.
- [ ] Task: Conductor - User Manual Verification 'Schema Synchronization' (Protocol in workflow.md)

## Phase 3: Verification

- [ ] Task: Verify Integrity
    - [ ] Run `npm run test` to ensure configuration loading works correctly.
    - [ ] Run `npm run typecheck` to ensure type definitions are consistent.
    - [ ] (Optional) Create a dummy `opencode.json` (or similar) to manually verify schema validation if feasible.
- [ ] Task: Conductor - User Manual Verification 'Verification' (Protocol in workflow.md)
