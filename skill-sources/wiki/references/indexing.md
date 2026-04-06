# Indexing Protocol

Reference: when and how to create and update `_index.md` files across the wiki.

---

## Purpose

Index files (`_index.md`) are Claude's navigation system. Instead of scanning hundreds of files, Claude reads a single index to find what it needs. This is the key efficiency mechanism for the 3-hop navigation strategy.

---

## The 3-Hop Strategy

When answering a query or locating content:

1. **Hop 1**: Read master `_index.md` → get overview, identify which section is relevant
2. **Hop 2**: Read `wiki/{category}/_index.md` → scan summaries and tags for matches
3. **Hop 3**: Read only the matched article files

This means Claude typically reads 2-3 small index files plus 3-8 full articles, rather than scanning dozens of files.

---

## When to Update Indexes

Indexes MUST be updated whenever:

- A file is added to the directory
- A file is removed from the directory
- A file's frontmatter (`title`, `summary`, `tags`) changes
- Statistics change (after compilation or lint run)

---

## Index Update Procedures

### Adding a file

1. Read the current `_index.md`
2. Add a new row to the Contents table:
   ```
   | [filename.md](filename.md) | One-sentence summary | tag1, tag2 | YYYY-MM-DD |
   ```
3. If the file's tags introduce a new category, add it to the Categories section
4. Add entry to Recent Changes:
   ```
   - YYYY-MM-DD: Added filename.md (brief note)
   ```
5. Update "Last updated" date in the header

### Removing a file

1. Read the current `_index.md`
2. Remove the row from the Contents table
3. Remove from Categories section if this was the only file with that category
4. Add removal entry to Recent Changes
5. Update "Last updated" date

### After compilation

1. Update each affected category `_index.md` (`concepts/`, `topics/`, `references/`, `theses/`)
2. Update `wiki/_index.md`
3. Update master `_index.md`:
   - Recalculate article count (count `.md` files in `wiki/` subdirectories, excluding `_index.md`)
   - Set "Last compiled" to today's date
   - Add entry to Recent Changes

### After ingestion

1. Update `raw/{type}/_index.md` for the affected type directory
2. Update `raw/_index.md`
3. Update master `_index.md`:
   - Recalculate source count (count `.md` files in `raw/` subdirectories, excluding `_index.md`)
   - Add entry to Recent Changes

### After lint

1. Update master `_index.md`:
   - Set "Last lint" to today's date
   - Add entry to Recent Changes (e.g., `N checks, 0 critical, 2 warnings`)

### After output generation

1. Update `output/_index.md`
2. Update master `_index.md`:
   - Recalculate output count
   - Add entry to Recent Changes

---

## Master Index Statistics

The root `_index.md` statistics must reflect actual file counts — not manual tracking:

- **Sources**: count `.md` files in `raw/articles/`, `raw/papers/`, `raw/repos/`, `raw/notes/`, `raw/data/` (excluding `_index.md`)
- **Articles**: count `.md` files in `wiki/concepts/`, `wiki/topics/`, `wiki/references/`, `wiki/theses/` (excluding `_index.md`)
- **Outputs**: count `.md` files in `output/` (excluding `_index.md`)

---

## `_index.md` Template

```markdown
---
title: "[Directory Name] Index"
updated: YYYY-MM-DD
---

# [Directory Name] Index

> [One-line description of what this directory contains]

Last updated: YYYY-MM-DD

## Contents

| File | Summary | Tags | Updated |
|------|---------|------|---------|
| [filename.md](filename.md) | One-sentence summary | tag1, tag2 | YYYY-MM-DD |

## Categories

- **category-name**: file1.md, file2.md

## Recent Changes

- YYYY-MM-DD: Description of change
```

### Master `_index.md` additions

```markdown
## Statistics

- Sources: N raw documents
- Articles: N compiled wiki articles
- Outputs: N generated artifacts
- Last compiled: YYYY-MM-DD
- Last lint: YYYY-MM-DD

## Quick Navigation

- [All Sources](raw/_index.md)
- [Concepts](wiki/concepts/_index.md)
- [Topics](wiki/topics/_index.md)
- [References](wiki/references/_index.md)
- [Outputs](output/_index.md)
```

---

## Hub Index (`~/wiki/_index.md`)

The hub-level index lists topic wikis (not articles):

```markdown
---
title: "Wiki Hub Index"
updated: YYYY-MM-DD
---

# Wiki Hub

> Registry of all topic wikis

Last updated: YYYY-MM-DD

## Topic Wikis

| Wiki | Description | Path | Articles | Last Compiled |
|------|-------------|------|----------|---------------|
| [topic-name](topics/topic-name/_index.md) | Description | topics/topic-name/ | N | YYYY-MM-DD |

## Recent Activity

- YYYY-MM-DD: Description of hub-level activity
```

---

## Cross-Wiki Index Peek

When checking sibling wikis for overlap:

1. Read `~/wiki/wikis.json` to get the list of all wikis
2. For each sibling wiki, read ONLY its master `_index.md` (not full articles)
3. Check if any summaries or tags match the current query
4. If overlap found, note it in the response — never read full articles from sibling wikis unless explicitly asked by the user
