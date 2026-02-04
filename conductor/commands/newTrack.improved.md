# Conductor: New Track

Create a new track (feature/bug/chore) with spec and plan files.

---

## State Machine

```
START → SETUP_CHECK
  ├─ files exist → GET_DESCRIPTION
  └─ files missing → HALT("Run /conductor:setup")

GET_DESCRIPTION
  ├─ {{args}} provided → INFER_TYPE
  └─ {{args}} empty → prompt → INFER_TYPE

INFER_TYPE → SPEC_QUESTIONS
  └─ auto-classify: feature|bug|chore|refactor

SPEC_QUESTIONS → SPEC_DRAFT
  └─ loop until sufficient info gathered

SPEC_DRAFT ↔ SPEC_CONFIRMED
  └─ loop until user approves

PLAN_DRAFT ↔ PLAN_CONFIRMED
  └─ loop until user approves

CREATE_ARTIFACTS → DONE
```

---

## 1. SETUP_CHECK

**Required files** (halt if any missing):

- `conductor/tech-stack.md`
- `conductor/workflow.md`
- `conductor/product.md`

**On missing**: "Conductor not set up. Run `/conductor:setup` first." → STOP

---

## 2. GET_DESCRIPTION + INFER_TYPE

| Condition           | Action                                           |
| ------------------- | ------------------------------------------------ |
| `{{args}}` provided | Use as description                               |
| `{{args}}` empty    | Ask: "Describe the track (feature, bug, chore):" |

**Auto-classify** from description → `feature` | `bug` | `chore` | `refactor`

Never ask user to classify.

---

## 3. SPEC_QUESTIONS

### Protocol

| Step        | Rule                                                          |
| ----------- | ------------------------------------------------------------- |
| Classify    | **Additive** (brainstorming) or **Exclusive** (single choice) |
| Options     | Provide 2-3 choices (A, B, C) when possible                   |
| Last option | Always "Type your own answer"                                 |
| Suffix      | Additive → "(Select all that apply)" / Exclusive → none       |
| Pacing      | **ONE question per turn** — wait for response                 |
| Confirm     | Summarize understanding before next question                  |

### Question Count

| Type      | Questions |
| --------- | --------- |
| Feature   | 3-5       |
| Bug/Chore | 2-3       |

### Topic Examples

- **Feature**: UI approach, data flow, edge cases, integrations
- **Bug**: Repro steps, expected vs actual, environment
- **Chore**: Scope boundaries, success criteria, dependencies

---

## 4. SPEC_DRAFT

Draft `spec.md` with sections:

1. Overview
2. Functional Requirements
3. Non-Functional Requirements (if applicable)
4. Acceptance Criteria
5. Out of Scope

**Present** → await feedback → **revise** until confirmed.

---

## 5. PLAN_DRAFT

### Inputs

1. Confirmed spec content
2. `conductor/workflow.md` (TDD structure)

### Output Structure

```markdown
## Phase N: [Name]

- [ ] Task: [Description]
    - [ ] [Sub-task 1]
    - [ ] [Sub-task 2]

- [ ] Task: Conductor - User Manual Verification 'Phase N' (Protocol in workflow.md)
```

### Rules

| Rule         | Requirement                                       |
| ------------ | ------------------------------------------------- |
| Markers      | Every task/sub-task has `- [ ]`                   |
| TDD          | Write tests → Implement → Refactor                |
| Verification | Append phase verification task (from workflow.md) |

**Present** → await feedback → **revise** until confirmed.

---

## 6. CREATE_ARTIFACTS

### 6.1 Collision Check

```
List conductor/tracks/
Extract short names from existing track IDs
If proposed name exists → halt, suggest alternative
```

### 6.2 Generate ID

Format: `{shortname}_{YYYYMMDD}`

### 6.3 Write Files

| Path                                  | Content        |
| ------------------------------------- | -------------- |
| `conductor/tracks/{id}/metadata.json` | Template below |
| `conductor/tracks/{id}/spec.md`       | Confirmed spec |
| `conductor/tracks/{id}/plan.md`       | Confirmed plan |

**metadata.json**:

```json
{
    "track_id": "{id}",
    "type": "{feature|bug|chore|refactor}",
    "status": "new",
    "created_at": "{ISO}",
    "updated_at": "{ISO}",
    "description": "{description}"
}
```

### 6.4 Update Index

Append to `conductor/tracks.md`:

```markdown
- [ ] **Track: {Description}**
      _Link: [./conductor/tracks/{id}/](./conductor/tracks/{id}/)_
```

---

## 7. DONE

> "Track '{id}' created. Start implementation with `/conductor:implement`."

---

## Error Handling

| Error                | Recovery                                |
| -------------------- | --------------------------------------- |
| Setup files missing  | → "Run `/conductor:setup`" + STOP       |
| Track name collision | → Suggest alternatives, await choice    |
| File write failure   | → Retry once, report path + permissions |
| User rejects spec    | → Ask for specific changes, revise      |
| User rejects plan    | → Ask which tasks to modify, revise     |

**CRITICAL**: Validate every tool call. On error → halt + report.

---

## Quick Reference

```
FLOW: Setup → Description → Spec Q&A → Plan → Artifacts → Done

CREATES:
  conductor/tracks/{id}/
  ├── metadata.json
  ├── spec.md
  └── plan.md

UPDATES:
  conductor/tracks.md
```
