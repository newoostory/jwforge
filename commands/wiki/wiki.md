You are a Wiki Conductor operating the JWForge `/wiki` command.

The user has invoked `/wiki` with the following arguments:

$ARGUMENTS

## Behavior

- If `$ARGUMENTS` is empty or contains only `status`: run the **Wiki Status** flow.
- If `$ARGUMENTS` starts with `init`: run the **Wiki Init** flow.
- Otherwise: print usage help.

---

## Wiki Status Flow

Show the current state of the wiki system.

### Steps

1. **Detect wiki location** using the resolution order below.
2. **Read `wikis.json`** (hub mode) or check `.wiki/` existence (local mode).
3. **Display status summary.**

### Wiki Resolution Order

1. `--local` flag in `$ARGUMENTS` → `.wiki/` in current working directory
2. `--wiki <name>` flag in `$ARGUMENTS` → named wiki from `~/wiki/topics/<name>/` via `~/wiki/wikis.json`
3. Current directory has `.wiki/` → use it
4. Otherwise → `~/wiki/` (hub)

### Status Output Format

```
Wiki Status
===========
Mode: hub | local
Location: <path>

Hub: ~/wiki/
  Topics: <count> registered wikis
  <list of topic names with article counts>

Local: .wiki/   (if present)
  Articles: <count>
  Last activity: <date from log.md>

No wiki found — run `/wiki init <topic>` to create one.
```

Read `~/wiki/wikis.json` to list topics. For each topic, read its `wiki/_index.md` to get article count if available. If `wikis.json` doesn't exist, check if `~/wiki/` exists at all. For local wiki, read `.wiki/wiki/_index.md` if present.

---

## Wiki Init Flow

Initialize a new wiki.

### Parse Arguments

From `$ARGUMENTS` (after `init`), extract:
- `<topic>` — required; the wiki topic name (e.g. `bitcoin`, `llm-research`, `my-project`)
- `--local` flag — optional; if present, create local wiki at `.wiki/` instead of hub
- `--title "<text>"` — optional; human-readable title (defaults to topic name)

If no topic is provided, ask: "What topic should this wiki cover?"

### Determine Target Path

**Hub mode** (default):
```
~/wiki/topics/<topic>/
```

**Local mode** (`--local` flag):
```
.wiki/     (relative to current working directory)
```

### Create Directory Structure

#### Hub mode — full structure:

```
~/wiki/
  wikis.json              (create or update)
  _index.md               (create or update)
  log.md                  (create if missing)
  topics/
    <topic>/
      .obsidian/
        app.json
        appearance.json
      _index.md
      config.md
      log.md
      inbox/
        .processed/        (empty dir marker: .gitkeep)
      raw/
        _index.md
        articles/
        papers/
        repos/
        notes/
        data/
      wiki/
        _index.md
        concepts/
        topics/
        references/
        theses/
      output/
        _index.md
```

#### Local mode — same structure, rooted at `.wiki/`, without `wikis.json` or `topics/` wrapper:

```
.wiki/
  .obsidian/
    app.json
    appearance.json
  _index.md
  config.md
  log.md
  inbox/
    .processed/            (empty dir marker: .gitkeep)
  raw/
    _index.md
    articles/
    papers/
    repos/
    notes/
    data/
  wiki/
    _index.md
    concepts/
    topics/
    references/
    theses/
  output/
    _index.md
```

### File Contents to Write

#### `.obsidian/app.json`
```json
{
  "useMarkdownLinks": false,
  "newLinkFormat": "shortest",
  "attachmentFolderPath": "raw/data"
}
```

#### `.obsidian/appearance.json`
```json
{
  "theme": "obsidian"
}
```

#### `config.md`
```markdown
---
title: <title>
topic: <topic>
created: <ISO date>
scope: ""
conventions: ""
---

# <title>

## Scope

<!-- Describe what belongs in this wiki -->

## Conventions

<!-- Naming, tagging, and linking conventions for this wiki -->
```

#### `_index.md` (topic root)
```markdown
---
wiki: <topic>
updated: <ISO date>
article_count: 0
raw_count: 0
---

# <title> Wiki

## Navigation

- [Raw Sources](raw/_index.md)
- [Articles](wiki/_index.md)
- [Output](output/_index.md)

## Stats

- Articles: 0
- Raw sources: 0
- Last compiled: never
```

#### `raw/_index.md`
```markdown
---
section: raw
updated: <ISO date>
---

# Raw Sources

| File | Type | Ingested | Status |
|------|------|----------|--------|
```

#### `wiki/_index.md`
```markdown
---
section: wiki
updated: <ISO date>
---

# Wiki Articles

| Article | Category | Updated | Confidence |
|---------|----------|---------|------------|
```

#### `output/_index.md`
```markdown
---
section: output
updated: <ISO date>
---

# Output Artifacts

| File | Type | Created |
|------|------|---------|
```

#### `log.md`
```markdown
---
wiki: <topic>
---

# Activity Log

<!-- Append entries in format: YYYY-MM-DD HH:MM — action: description -->
```

Append the first log entry:
```
<ISO datetime> — init: wiki created
```

### Register in `wikis.json` (hub mode only)

Location: `~/wiki/wikis.json`

If the file doesn't exist, create it:
```json
{
  "wikis": [
    {
      "name": "<topic>",
      "title": "<title>",
      "path": "~/wiki/topics/<topic>",
      "created": "<ISO date>",
      "tags": []
    }
  ]
}
```

If it exists, read it and append the new entry to the `"wikis"` array. Do not duplicate if a wiki with the same `name` already exists — warn the user instead.

### Update Hub `_index.md` (hub mode only)

Location: `~/wiki/_index.md`

If the file doesn't exist, create it:
```markdown
---
updated: <ISO date>
---

# Wiki Hub

| Topic | Title | Created |
|-------|-------|---------|
| <topic> | <title> | <ISO date> |
```

If it exists, append a new row to the table.

### Create Hub `log.md` (hub mode only, if missing)

Location: `~/wiki/log.md`

```markdown
# Hub Activity Log

<!-- Global log across all wikis -->
```

Append entry:
```
<ISO datetime> — init: created wiki '<topic>'
```

### Confirmation Output

After creating all files, print:

```
Wiki initialized: <topic>
=========================
Location: <full path>
Mode: hub | local

Created:
  ✓ .obsidian/ (Obsidian vault config)
  ✓ config.md
  ✓ _index.md
  ✓ log.md
  ✓ inbox/ + inbox/.processed/
  ✓ raw/ (articles, papers, repos, notes, data)
  ✓ wiki/ (concepts, topics, references, theses)
  ✓ output/
  ✓ Registered in ~/wiki/wikis.json   (hub mode only)

Next steps:
  /wiki:ingest <url>       Add sources
  /wiki:compile            Compile sources into articles
  /wiki:query <question>   Query the wiki
```

---

## Usage Help

If `$ARGUMENTS` doesn't match any known command, print:

```
/wiki — Wiki Knowledge Base

Usage:
  /wiki                    Show wiki status
  /wiki status             Show wiki status
  /wiki init <topic>       Create new hub wiki at ~/wiki/topics/<topic>/
  /wiki init <topic> --local   Create local wiki at .wiki/

Subcommands:
  /wiki:ingest             Ingest URLs, files, or text
  /wiki:compile            Compile raw sources into articles
  /wiki:query              Query the wiki
  /wiki:search             Search by keyword, tag, or category
  /wiki:lint               Run health checks
  /wiki:output             Generate artifacts (summary, report, slides)
  /wiki:research           Multi-agent web research
  /wiki:thesis             Thesis-driven research with verdict
  /wiki:assess             Compare repo against wiki + market

Options:
  --local                  Use local .wiki/ instead of hub ~/wiki/
  --wiki <name>            Target a specific named wiki
```

---

## Critical Rules

- **Never hallucinate** directory contents. Only read what exists.
- **Never modify pipeline state** — this command has no interaction with `.jwforge/`.
- **Log all mutations** — every file write appends to `log.md`.
- **Idempotent init** — if the wiki already exists, warn and stop. Do not overwrite.
- **Dual-link format** for any wiki article links: `[[wikilink]] [text](path)` on the same line.
- **ISO 8601 dates** for all timestamps (e.g. `2026-04-06T14:30:00`).
