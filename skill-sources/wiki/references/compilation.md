# Compilation Protocol

Reference: step-by-step procedure for transforming raw sources into synthesized wiki articles.

---

## Overview

Compilation is the core "LLM compiler" operation: read raw sources and produce synthesized, cross-referenced knowledge articles in `wiki/`. Articles are synthesized and contextualized — not copy-pasted from sources.

---

## Incremental vs Full

| Mode | Behavior |
|------|---------|
| Incremental (default) | Process only sources with `ingested` date after `Last compiled` in master `_index.md` |
| `--full` | Re-read all sources, rewrite all articles. Expensive but ensures full consistency. |

---

## The Compilation Loop

### Step 1: Survey

1. Read `raw/_index.md` to see all sources
2. Read `wiki/_index.md` to see existing articles
3. For incremental: identify sources where `ingested` > `Last compiled` date
4. For full: use all sources
5. Read each identified source file in full

### Step 2: Extract

For each source, identify:
- **Key concepts**: nouns, technical terms, named entities
- **Key facts**: claims, data points, measurements, relationships
- **Key relationships**: X relates to Y, X is a type of Y, X was created by Y

### Step 3: Map to Existing Wiki

Read `wiki/_index.md` and the category index files. For each key concept:
- Already has an article → plan to **UPDATE** it with new information
- Major concept worthy of its own article → plan to **CREATE** one
- Minor mention → will be referenced within another article

### Step 4: Classify New Articles

| Category | Definition | Examples |
|----------|-----------|---------|
| `concept` | Specific, bounded idea explainable in 1-3 pages | "Transformer Architecture", "Gradient Descent" |
| `topic` | Broader theme tying multiple concepts together | "Deep Learning", "DevOps" |
| `reference` | Curated list of resources, tools, or links | "Python ML Libraries", "Transformer Paper Timeline" |

### Step 5: Write New Articles

1. Write the abstract paragraph — what is this and why does it matter?
2. Write the body — explain using information from source(s). Synthesize, contextualize. Do NOT copy-paste.
3. When referencing another wiki article inline, use dual-link format:
   `[[slug|Name]] ([Name](../category/slug.md))` — serves both Obsidian and Claude
4. Add "See Also" section linking to related wiki articles using dual-link format (check wiki index for related tags/concepts)
5. Add "Sources" section linking back to the raw files
6. Generate frontmatter per `references/wiki-structure.md` — include `aliases` for alternate names
7. Set `confidence` in frontmatter:
   - `high`: multiple sources agree, well-established
   - `medium`: single source, partially corroborated, or recent/unreplicated
   - `low`: anecdotal, single non-peer-reviewed source, or sources disagree

### Step 6: Update Existing Articles

1. Read the existing article in full
2. Identify what the new source adds (new facts, perspectives, connections)
3. Integrate new information into appropriate sections using Edit (not full rewrite)
4. Add the new source to the "Sources" section
5. Update the `updated` date in frontmatter
6. Check if new "See Also" links are warranted

### Step 7: Bidirectional Linking

For every "See Also" link from article A → article B:
- Check if B has a "See Also" link back to A
- If not, add one with a brief relationship note
- Format: `[[slug|Name]] ([Name](../category/slug.md)) — relationship note`

### Step 8: Update All Indexes

After all articles are written/updated:

1. Each category `_index.md` (`concepts/`, `topics/`, `references/`, `theses/`) — add or update rows
2. `wiki/_index.md` — add or update rows
3. Master `_index.md` — update article count, set "Last compiled" to today, add to Recent Changes

See `references/indexing.md` for the full index update procedure.

---

## Article Body Format

```markdown
---
title: "Article Title"
category: concept|topic|reference
sources: [raw/type/file1.md, raw/type/file2.md]
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: [tag1, tag2]
aliases: [alternate name]
confidence: high|medium|low
summary: "2-3 sentence summary for index"
---

# Article Title

> [One-paragraph abstract]

## [Sections as appropriate]

[Synthesized content with dual-link cross-references]

## See Also

- [[related-slug|Related Article]] ([Related Article](../category/related-slug.md)) — relationship note

## Sources

- [Source Title](../../raw/type/file.md) — what this source contributed
```

See `references/wiki-structure.md` for the full dual-link convention.

---

## Quality Standards

| Standard | Requirement |
|----------|------------|
| Self-contained | Articles are readable without consulting raw sources |
| Synthesized | Draw from multiple sources when possible, not just one |
| Accurate | Do not simplify to the point of being wrong |
| Clear | Direct language. Knowledge base, not a blog post. |
| Honest disagreement | When sources disagree, note the disagreement rather than picking a side |
| Connected | Every article must link to at least one other article via "See Also" |
| Honest gaps | Never hallucinate; say when knowledge is missing or uncertain |
