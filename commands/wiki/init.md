You are a Wiki Initialization agent. Your task is to initialize the wiki hub and/or create a new topic wiki.

The user has invoked `/wiki:init` with:

$ARGUMENTS

## Step 1: Parse Arguments

From $ARGUMENTS, extract:
- **Topic name**: the positional argument (e.g. `my-topic`). If omitted, initialize hub only.
- **Flags**: none defined; treat unknown flags as errors.

Validate topic name: lowercase letters, numbers, hyphens only. Reject if it contains spaces or special characters.

## Step 2: Resolve Hub

Check if `~/wiki/` exists:

- **If it does not exist**: perform Hub Initialization (Step 3), then continue.
- **If it exists**: skip Step 3, proceed to Step 4.

## Step 3: Hub Initialization (first-time only)

Create the following hub-level structure. Skip any file or directory that already exists.

```
~/wiki/
  wikis.json          ← registry of all topic wikis
  _index.md           ← hub index
  log.md              ← hub activity log
  topics/             ← parent directory for all topic wikis
```

**wikis.json** initial content:
```json
{
  "wikis": []
}
```

**_index.md** frontmatter:
```yaml
---
title: Wiki Hub
created: <ISO date>
topics: 0
---
```

**log.md** initial content:
```
# Wiki Hub Log

[<date>] hub init: wiki hub created
```

## Step 4: Topic Initialization

If no topic name was provided in $ARGUMENTS, skip this step and report hub status only.

If a topic name was provided:

### 4-A: Check for existing topic

Read `~/wiki/wikis.json`. If an entry with `name: <topic-name>` already exists:
- Report: "Topic `<name>` already registered — skipping."
- Do NOT modify any existing files inside that topic.
- Proceed to Step 5.

### 4-B: Create topic directory structure

Create the following structure. Skip any file or directory that already exists.

```
~/wiki/topics/<name>/
  inbox/                          ← drop zone for unprocessed sources
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
  config.md
  log.md
  _index.md
```

**raw/_index.md** frontmatter:
```yaml
---
title: Raw Sources — <name>
topic: <name>
count: 0
sources: []
---
```

**wiki/_index.md** frontmatter:
```yaml
---
title: Wiki Articles — <name>
topic: <name>
count: 0
articles: []
---
```

**_index.md** (topic root) frontmatter:
```yaml
---
title: <name>
created: <ISO date>
raw_count: 0
wiki_count: 0
---
```

**config.md** initial content:
```markdown
# Config — <name>

topic: <name>
created: <ISO date>
```

**log.md** initial content:
```
# Log — <name>

[<date>] init: topic created
```

### 4-C: Create .obsidian settings

Create `~/wiki/topics/<name>/.obsidian/app.json` with:
```json
{
  "useMarkdownLinks": false,
  "showFrontmatter": true
}
```

Skip if `.obsidian/` already exists.

### 4-D: Register in wikis.json

Append to the `wikis` array in `~/wiki/wikis.json`:
```json
{
  "name": "<name>",
  "path": "~/wiki/topics/<name>/",
  "created": "<ISO date>"
}
```

Update `_index.md` at hub root: increment `topics` count by 1.

Append to `~/wiki/log.md`:
```
[<date>] init: topic '<name>' registered
```

## Step 5: Report

On success:
```
Wiki initialized.

Hub: ~/wiki/
  wikis.json — <N> topic(s) registered

Topic: <name>  (NEW | already existed)
  ~/wiki/topics/<name>/
  inbox/    raw/    wiki/    output/
  config.md  log.md  _index.md

Next: run /wiki:ingest to add sources
```

If hub-only init (no topic name):
```
Wiki hub initialized at ~/wiki/
  wikis.json — 0 topics registered

Use /wiki:init <topic-name> to create your first topic wiki.
```

## Rules

- **Idempotent**: never overwrite or truncate files that already exist.
- **Never touch existing topic internals**: if a topic is already registered, do not modify its files.
- Topic names must be safe filesystem identifiers: lowercase, hyphens, no spaces.
- `.obsidian/` is only created if it does not already exist; never modify existing Obsidian settings.
- All created `_index.md` files must have valid YAML frontmatter.
