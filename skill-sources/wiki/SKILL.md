---
name: wiki
description: "LLM-compiled knowledge base manager. Activates for wiki directories, /wiki commands, or keywords like wiki, knowledge base, ingest, compile wiki."
user-invocable: true
argument-hint: "[init <topic> [--local]] | [status]"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, WebFetch, WebSearch, Agent
---

# Wiki Manager

You manage an LLM-compiled knowledge base. This skill activates for `/wiki` commands, ambient wiki-related queries, and structural guardianship of wiki directories.

Wiki is **standalone** -- no JWForge pipeline state, no hooks, no teams. All operations run as Conductor-direct or via Agent tool for parallel research.

---

## Ambient Activation

This skill activates when ANY of these conditions are true:

1. User explicitly invokes `/wiki` or any `/wiki:<subcommand>`
2. User mentions "wiki", "knowledge base", "ingest", "compile wiki"
3. User asks a factual question AND (`~/wiki/` exists OR current directory has `.wiki/`)

### Ambient Query Handling

When activated by ambient trigger (not explicit `/wiki` command):

1. Resolve wiki location (see Wiki Resolution below)
2. If no wiki exists, answer normally. Optionally suggest: "You could start a wiki with `/wiki init <topic>`"
3. If wiki exists, read the master `_index.md`
4. If relevant content exists, read the relevant articles and answer with citations: `[source: wiki/<path>]`
5. If no relevant content, answer normally and optionally suggest `/wiki:ingest`

---

## Wiki Resolution Order

Determine which wiki to operate on, in priority order:

| Priority | Condition | Wiki Root |
|----------|-----------|-----------|
| 1 | `--local` flag present | `.wiki/` in current project |
| 2 | `--wiki <name>` flag present | `~/wiki/topics/<name>/` (looked up via `~/wiki/wikis.json`) |
| 3 | Current directory has `.wiki/` | `.wiki/` |
| 4 | Default | `~/wiki/` (hub) |

For hub-level operations (`/wiki` status, listing wikis), always use `~/wiki/`.
For topic operations, resolve to the specific topic directory.

---

## `/wiki` (Status)

When invoked as `/wiki` with no subcommand or `/wiki status`:

1. Check if `~/wiki/` exists. If not: "No wiki hub found. Run `/wiki init <topic>` to create one."
2. Read `~/wiki/wikis.json` to list registered topic wikis
3. Read `~/wiki/_index.md` for hub summary
4. Check for `.wiki/` in current directory (local wiki)
5. Display: hub topic count with article counts and last-updated per topic, local wiki status if present, and quick action suggestions (`init`, `ingest`, `query`)

---

## `/wiki init <topic>`

Create a new topic wiki with full directory structure.

### Hub Init (default)

1. Create hub if it doesn't exist:
   ```
   ~/wiki/
     wikis.json          # {"wikis": []}
     _index.md           # Hub index
     log.md              # Global activity log
     topics/
   ```

2. Create topic sub-wiki:
   ```
   ~/wiki/topics/<topic>/
     .obsidian/          # Vault config (community-plugins.json, app.json)
     _index.md           # Master index with stats
     config.md           # Title, scope, conventions
     log.md              # Topic activity log
     inbox/
       .processed/
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

3. Register in `~/wiki/wikis.json` with `name`, `path` ("topics/<topic>"), `created` (YYYY-MM-DD), `article_count` (0)

4. Update `~/wiki/_index.md` and `~/wiki/log.md`

### Local Init (`--local`)

Same structure rooted at `.wiki/` without `wikis.json` or `topics/` nesting:

```
.wiki/
  .obsidian/
  _index.md
  config.md
  log.md
  inbox/
    .processed/
  raw/
    _index.md
    articles/ papers/ repos/ notes/ data/
  wiki/
    _index.md
    concepts/ topics/ references/ theses/
  output/
    _index.md
```

### Reference: Full Structure Details

For exact file formats, frontmatter schemas, and naming conventions:
```
Read("references/wiki-structure.md")
```

---

## Core Principles

1. **Index-first navigation** -- Always read `_index.md` before scanning directories. Indexes contain summaries, tags, and file lists. Never use Glob to discover content when an index exists.

2. **Immutable raw sources** -- Content in `raw/` is never modified after ingestion. It is the permanent record.

3. **Synthesized articles** -- Wiki articles draw from multiple sources, contextualize, and cross-reference. They are textbook entries, not copies.

4. **Dual-linking** -- Every cross-reference uses both formats on the same line:
   `[[Article Name]] [Article Name](relative/path.md)`

5. **Structured frontmatter** -- Every `.md` file has YAML frontmatter with at minimum: `title`, `created`, `tags`. Articles add `summary`, `sources`, `confidence`.

6. **Incremental compilation** -- Only process new/uncompiled sources by default. Use `--full` flag for full recompilation.

7. **Honest gaps** -- Never fabricate information. State when the wiki lacks an answer. Note confidence levels.

---

## Confidence Scoring

Articles include `confidence` in frontmatter: **high** (multiple authoritative sources with consensus), **medium** (single source or partial agreement), **low** (anecdotal, non-peer-reviewed, or conflicting). Query responses note confidence. Linting flags low-confidence content.

---

## Activity Logging

All operations append to `log.md`: `## [YYYY-MM-DD] operation | Description` with details. Entries are append-only -- never modify existing entries.

---

## Structural Guardian

Runs lightweight checks on these triggers:
- After any write operation to the wiki
- On skill activation if 7+ days since last lint (check `log.md` for last `lint` entry)
- When user reports wiki issues

### Quick Checks

1. **Hub integrity** -- `~/wiki/` contains only `wikis.json`, `_index.md`, `log.md`, `topics/`
2. **Index freshness** -- File counts in directories match entry counts in `_index.md`
3. **Orphan detection** -- Files not listed in any index
4. **Directory completeness** -- All expected subdirectories exist
5. **wikis.json sync** -- Registered wikis match actual topic directories
6. **Log presence** -- Every wiki has a `log.md`

### Behavior

- **Auto-fix** trivial issues: missing indexes, unregistered wikis, missing directories
- **Warn** on structural problems: orphaned files, stale indexes, missing raw sources
- **Never block** the user. Guardian is advisory, not a gate.

For the full lint check catalog and auto-fix rules: `Read("references/linting.md")`

---

## Reference Documents

Detailed protocols are in reference documents. Read them when executing the corresponding operations:

| Reference | When to Read | Path |
|-----------|-------------|------|
| Wiki Structure | During `init`, structural checks | `Read("references/wiki-structure.md")` |
| Ingestion Protocol | During `/wiki:ingest` | `Read("references/ingestion.md")` |
| Compilation Protocol | During `/wiki:compile` | `Read("references/compilation.md")` |
| Index Update Protocol | After any content change | `Read("references/indexing.md")` |
| Lint Check Catalog | During `/wiki:lint`, guardian | `Read("references/linting.md")` |

Do NOT read all references at once. Read only the ones needed for the current operation.

---

## Subcommands

These are available as separate command files (`/wiki:<name>`):

| Command | Purpose |
|---------|---------|
| `/wiki:ingest` | Ingest URLs, files, text, inbox items into `raw/` |
| `/wiki:compile` | Compile raw sources into wiki articles |
| `/wiki:query` | Query wiki with citations (quick/standard/deep) |
| `/wiki:search` | Search wiki by keyword, tag, category |
| `/wiki:lint` | Health checks: structure, links, frontmatter, coverage |
| `/wiki:output` | Generate artifacts: summary, report, slides |
| `/wiki:research` | Multi-agent web research (5/8/10 parallel agents) |
| `/wiki:thesis` | Thesis-driven research with verdict |
| `/wiki:assess` | Compare repo against wiki + market intelligence |
