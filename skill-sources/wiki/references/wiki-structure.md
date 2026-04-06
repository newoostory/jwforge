# Wiki Directory Structure

Reference: directory layout, file formats, naming conventions, and frontmatter schemas for the JWForge wiki skill.

---

## Hub (`~/wiki/`)

The hub is lightweight — it tracks topic wikis but holds no article content.

```
~/wiki/
├── wikis.json                     # Registry of all topic wikis
├── _index.md                      # Lists topic wikis with stats
├── log.md                         # Global activity log
└── topics/                        # Each topic is a full wiki
    ├── <topic-name>/
    └── ...
```

## Topic Sub-Wiki (`~/wiki/topics/<name>/`)

All content lives here. Each topic wiki has the full structure:

```
~/wiki/topics/<name>/
├── .obsidian/                     # Obsidian vault config
├── _index.md                      # Master index: stats, quick nav, recent changes
├── config.md                      # Title, scope, conventions
├── log.md                         # Topic-level activity log
├── inbox/                         # Drop zone for this topic
│   └── .processed/
├── raw/                           # Immutable source material
│   ├── _index.md
│   ├── articles/
│   │   ├── _index.md
│   │   └── *.md
│   ├── papers/
│   │   ├── _index.md
│   │   └── *.md
│   ├── repos/
│   │   ├── _index.md
│   │   └── *.md
│   ├── notes/
│   │   ├── _index.md
│   │   └── *.md
│   └── data/
│       ├── _index.md
│       └── *.md
├── wiki/                          # Compiled articles (LLM-maintained)
│   ├── _index.md
│   ├── concepts/
│   │   ├── _index.md
│   │   └── *.md
│   ├── topics/
│   │   ├── _index.md
│   │   └── *.md
│   ├── references/
│   │   ├── _index.md
│   │   └── *.md
│   └── theses/                    # Thesis investigations
│       ├── _index.md
│       └── *.md
└── output/                        # Generated artifacts
    ├── _index.md
    └── *.md
```

## Local Wiki (`--local` flag)

Same structure as above but rooted at `<project>/.wiki/` — without `wikis.json` or `topics/`:

```
<project>/.wiki/
├── _index.md
├── config.md
├── log.md
├── inbox/
│   └── .processed/
├── raw/
│   ├── _index.md
│   ├── articles/
│   ├── papers/
│   ├── repos/
│   ├── notes/
│   └── data/
├── wiki/
│   ├── _index.md
│   ├── concepts/
│   ├── topics/
│   ├── references/
│   └── theses/
└── output/
    └── _index.md
```

## Wiki Resolution Order

When any `/wiki` command runs, resolve which wiki to use:

1. `--local` flag present → `<cwd>/.wiki/`
2. `--wiki <name>` flag present → look up name in `~/wiki/wikis.json`
3. Current directory has `.wiki/` → use it
4. Otherwise → `~/wiki/`

---

## Frontmatter YAML Schemas

### `wikis.json` Format

```json
{
  "wikis": [
    {
      "name": "<topic>",
      "title": "<Human-readable title>",
      "path": "~/wiki/topics/<topic>",
      "created": "<ISO date>",
      "tags": []
    }
  ]
}
```

Each entry is appended when `/wiki init <topic>` runs. Do not duplicate entries with the same `name`.

### `config.md` Frontmatter

```yaml
---
title: "Wiki Title"
topic: "<topic-slug>"
created: YYYY-MM-DD
scope: "What this wiki covers"
conventions: "Project-specific naming or style rules"
---
```

Full body:

```markdown
# Wiki Configuration

## Scope

[What topics this wiki covers]

## Conventions

[Any wiki-specific conventions beyond defaults]
```

### Raw Source File Frontmatter (`raw/**/*.md`)

Required fields:

```yaml
---
title: "Title"
source: "URL or filepath or MANUAL"
type: articles|papers|repos|notes|data
ingested: YYYY-MM-DD
tags: [tag1, tag2]
summary: "2-3 sentence summary"
---
```

- `type` must be one of: `articles`, `papers`, `repos`, `notes`, `data`
- `source` is the original URL, filepath, or `MANUAL` for freeform text
- `tags` must be a non-empty list
- `summary` must be non-empty

### Wiki Article Frontmatter (`wiki/**/*.md`)

Required fields:

```yaml
---
title: "Article Title"
category: concept|topic|reference
sources: [raw/type/file1.md, raw/type/file2.md]
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: [tag1, tag2]
aliases: [alternate name, another alias]
confidence: high|medium|low
summary: "2-3 sentence summary for index"
---
```

- `category` must be one of: `concept`, `topic`, `reference`
- `sources` is a list of relative paths to raw source files
- `aliases` enables Obsidian alternate-name discovery
- `confidence` scoring rules:
  - `high`: multiple sources agree, well-established knowledge
  - `medium`: single source, partially corroborated, or recent/unreplicated
  - `low`: anecdotal, single non-peer-reviewed source, or sources disagree

### Output Artifact Frontmatter (`output/*.md`)

```yaml
---
title: "Output Title"
type: summary|report|study-guide|slides|timeline|glossary|comparison
sources: [wiki/category/article.md, ...]
generated: YYYY-MM-DD
---
```

---

## `_index.md` Format

Every directory MUST have an `_index.md`. This is Claude's primary navigation aid — read it first, never scan directories.

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

### Master `_index.md` (root level)

Additionally includes:

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

## `log.md` Format

Append-only chronological activity log. Every wiki operation appends an entry. Never edit or delete existing entries. Format is grep-friendly:

```markdown
# Wiki Activity Log

## [2026-04-04] init | Wiki initialized
## [2026-04-04] ingest | Attention Is All You Need (raw/papers/2026-04-04-attention-is-all-you-need.md)
## [2026-04-04] compile | 2 sources → 3 new articles, 1 updated
## [2026-04-04] query | "How does self-attention work?" → answered from 2 articles
## [2026-04-05] lint | 12 checks, 0 critical, 2 warnings, 3 suggestions, 1 auto-fixed
## [2026-04-05] research | "transformer variants" → 5 sources ingested, 4 articles compiled
## [2026-04-05] output | summary on transformer-architecture → output/summary-transformer-architecture-2026-04-05.md
```

Each entry format: `## [YYYY-MM-DD] operation | Description`

Valid operations: `init`, `ingest`, `compile`, `query`, `lint`, `research`, `thesis`, `assess`, `output`

Useful for: `grep "^## \[" log.md | tail -10` to see recent activity.

---

## Wiki Article Body Format (`wiki/**/*.md`)

```markdown
---
[frontmatter as above]
---

# Article Title

> [One-paragraph abstract]

## [Sections as appropriate]

[Synthesized content — explain, contextualize, connect. NOT copy-paste from sources.]

When referencing another wiki article inline, use dual-link format:
[[article-slug|Display Name]] ([Display Name](../category/article-slug.md))

## See Also

- [[related-slug|Related Article]] ([Related Article](../category/related-slug.md)) — relationship note

## Sources

- [Source Title](../../raw/type/file.md) — what this source contributed
```

---

## Dual-Link Convention

All cross-references between wiki articles use BOTH link formats on the same line:

```
[[target-slug|Display Text]] ([Display Text](../category/target-slug.md))
```

- **Obsidian** reads the `[[wikilink]]` for its graph view, backlinks panel, and navigation
- **Claude** follows the standard markdown `(relative/path.md)` link
- Both coexist on one line so neither system misses the connection

For inline mentions in article body text:

```
The [[transformer-architecture|Transformer]] ([Transformer](../concepts/transformer-architecture.md)) uses self-attention...
```

---

## File Naming Conventions

| File type | Pattern | Example |
|-----------|---------|---------|
| Raw sources | `YYYY-MM-DD-descriptive-slug.md` | `2026-04-04-attention-is-all-you-need.md` |
| Wiki articles | `descriptive-slug.md` | `transformer-architecture.md` |
| Output artifacts | `{type}-{topic-slug}-{YYYY-MM-DD}.md` | `summary-transformers-2026-04-05.md` |

Rules:
- Lowercase letters only
- Hyphens for spaces
- No special characters
- Max 60 characters (excluding `.md`)

---

## Tag Convention

Tags are lowercase, hyphenated. Prefer specific over general:

- Good: `transformer-architecture`, `self-attention`, `natural-language-processing`
- Bad: `ai`, `ml`, `tech`

Normalize across the wiki — no near-duplicates like `ml` vs `machine-learning`. When linting detects duplicates, the canonical (longer) form wins.

---

## Obsidian Compatibility

The wiki is designed to be opened as an Obsidian vault. On `/wiki init`, a `.obsidian/` config directory is created with minimal settings.

Key compatibility notes:
- YAML frontmatter `tags` field is read natively by Obsidian
- `aliases` in frontmatter lets Obsidian find articles by alternate names
- `_index.md` files appear as regular notes in Obsidian (this is fine)
- The `inbox/` folder works as a natural Obsidian inbox
- Graph view shows connections via `[[wikilinks]]`
