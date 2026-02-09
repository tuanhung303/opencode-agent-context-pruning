# Auto-Supersede Mechanisms

ACP automatically removes redundant content through 8 strategies. No agent action required — these run on every message transform.

---

## 1. Hash-Based Supersede

Duplicate tool calls with identical arguments are automatically deduplicated.

```
┌─────────────────────────────────────┐        ┌─────────────────────────────────────┐
│ BEFORE:                             │        │ AFTER:                              │
│                                     │        │                                     │
│   1. read(package.json) #a1b2c3     │   ───► │   ...other work...                  │
│   2. ...other work...               │        │   3. read(package.json) #d4e5f6◄──┐ │
│   3. read(package.json) #d4e5f6     │        │                                     │
│                                     │        │  First call superseded (hash match) │
│  Tokens: ~15,000                    │        │  Tokens: ~10,000  (-33%)            │
└─────────────────────────────────────┘        └─────────────────────────────────────┘
```

---

## 2. File-Based Supersede (One-File-One-View)

File operations automatically supersede previous operations on the same file.

```
┌─────────────────────────────────────┐        ┌─────────────────────────────────────┐
│ BEFORE:                             │        │ AFTER:                              │
│                                     │        │                                     │
│   1. read(config.ts)                │   ───► │                                     │
│   2. write(config.ts)               │        │   3. edit(config.ts)◄────────────┐  │
│   3. edit(config.ts)                │        │                                     │
│                                     │        │  Previous operations pruned         │
│  Tokens: ~18,000                    │        │  Tokens: ~6,000  (-67%)             │
└─────────────────────────────────────┘        └─────────────────────────────────────┘
```

---

## 3. Todo-Based Supersede (One-Todo-One-View)

Todo operations automatically supersede previous todo states.

```
┌─────────────────────────────────────┐        ┌─────────────────────────────────────┐
│ BEFORE:                             │        │ AFTER:                              │
│                                     │        │                                     │
│   1. todowrite: pending             │   ───► │                                     │
│   2. todowrite: in_progress         │        │   3. todowrite: completed◄────────┐ │
│   3. todowrite: completed           │        │                                     │
│                                     │        │  Previous states auto-pruned        │
│  Tokens: ~4,500                     │        │  Tokens: ~1,500  (-67%)             │
└─────────────────────────────────────┘        └─────────────────────────────────────┘
```

---

## 4. Source-URL Supersede

Identical URL fetches are deduplicated — only the latest response is retained.

---

## 5. State Query Supersede

State queries (`ls`, `find`, `pwd`, `git status`) are deduplicated — only the latest results matter.

---

## 6. Context-Based Supersede

New `context_prune` tool calls supersede previous context operations, preventing context management overhead from accumulating.

---

## 7. Snapshot-Based Supersede

Only the latest snapshot per file is retained. Previous snapshots are automatically pruned.

---

## 8. Retry-Based Supersede

Failed tool attempts are automatically removed when the operation succeeds on retry.

---

← Back to [README](../README.md)
