# Conductor: New Track

Create a new track (feature/bug/chore) with spec and plan files.

---

## 1. SETUP CHECK

**Required files** — halt if missing:

- `conductor/tech-stack.md`
- `conductor/workflow.md`
- `conductor/product.md`

If missing: "Conductor not set up. Run `/conductor:setup` first."

---

## 2. INITIALIZATION

### 2.1 Get Description

| Condition           | Action                                           |
| ------------------- | ------------------------------------------------ |
| `{{args}}` provided | Use as description                               |
| `{{args}}` empty    | Ask: "Describe the track (feature, bug, chore):" |

### 2.2 Infer Type

Analyze description → classify as `feature` | `bug` | `chore` | `refactor`

Do NOT ask user to classify.

---

## 3. SPEC GENERATION (Interactive)

### Question Protocol

1. **One question per turn** — wait for response
2. **Provide 2-3 options** (A, B, C) when possible
3. **Last option always**: "Type your own answer"
4. **Classify each question**:
    - **Additive** (multiple answers OK): Add "(Select all that apply)"
    - **Exclusive** (single answer): No suffix

### Question Count

| Type      | Questions     |
| --------- | ------------- |
| Feature   | 3-5 questions |
| Bug/Chore | 2-3 questions |

### Question Examples

**Feature**: UI approach, data flow, edge cases, integration points
**Bug**: Reproduction steps, expected vs actual, environment
**Chore**: Scope boundaries, success criteria, dependencies

### Draft & Confirm

After gathering info, draft `spec.md` with:

- Overview
- Functional Requirements
- Non-Functional Requirements (if any)
- Acceptance Criteria
- Out of Scope

Present draft → await confirmation → revise if needed.

---

## 4. PLAN GENERATION

### Generate from Spec + Workflow

Read:

1. Confirmed `spec.md` content
2. `conductor/workflow.md` (for TDD structure)

### Plan Structure

```markdown
## Phase 1: [Name]

- [ ] Task: [Description]
    - [ ] [Sub-task 1]
    - [ ] [Sub-task 2]

- [ ] Task: Conductor - User Manual Verification 'Phase 1' (Protocol in workflow.md)
```

**Rules**:

- Every task/sub-task has `- [ ]` marker
- Follow TDD: Write tests → Implement → Refactor
- Append verification task to each phase (from workflow.md protocol)

Present draft → await confirmation → revise if needed.

---

## 5. CREATE ARTIFACTS

### 5.1 Check Existing Tracks

```
List: conductor/tracks/
Extract: existing short names from track IDs
```

If proposed name exists → halt, suggest different name.

### 5.2 Generate Track ID

Format: `{shortname}_{YYYYMMDD}`

### 5.3 Create Files

| File                                  | Content            |
| ------------------------------------- | ------------------ |
| `conductor/tracks/{id}/metadata.json` | See template below |
| `conductor/tracks/{id}/spec.md`       | Confirmed spec     |
| `conductor/tracks/{id}/plan.md`       | Confirmed plan     |

**metadata.json template**:

```json
{
    "track_id": "{id}",
    "type": "feature",
    "status": "new",
    "created_at": "{ISO timestamp}",
    "updated_at": "{ISO timestamp}",
    "description": "{Initial description}"
}
```

### 5.4 Update Tracks File

Append to `conductor/tracks.md`:

```markdown
- [ ] **Track: {Description}**
      _Link: [./conductor/tracks/{id}/](./conductor/tracks/{id}/)_
```

---

## 6. COMPLETION

Announce:

> "Track '{id}' created. Start implementation with `/conductor:implement`."

---

## Tool Call Validation

**CRITICAL**: After every tool call:

1. Check for errors in response
2. If error → halt immediately, report to user
3. If success → proceed to next step

---

## Quick Reference

```
FLOW: Setup → Description → Spec (Q&A) → Plan → Artifacts → Done

FILES CREATED:
  conductor/tracks/{id}/
  ├── metadata.json
  ├── spec.md
  └── plan.md

UPDATED:
  conductor/tracks.md
```
