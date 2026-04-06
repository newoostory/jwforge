# Ingestion Protocol

Reference: step-by-step procedures for converting external material into raw wiki sources.

---

## Overview

Ingestion converts external material into a standardized raw source file in `raw/`. Sources are immutable after ingestion — never edited in place.

---

## Source Type Detection

| Type | Directory | Auto-detect signals |
|------|-----------|-------------------|
| `articles` | `raw/articles/` | General web URLs, blog posts |
| `papers` | `raw/papers/` | arxiv.org, scholar.google, `.pdf` URLs, academic language |
| `repos` | `raw/repos/` | github.com, gitlab.com URLs |
| `notes` | `raw/notes/` | Freeform text, no URL |
| `data` | `raw/data/` | `.csv`, `.json`, `.tsv` URLs or files, dataset references |

---

## URL Ingestion

### Step 1 — Tweet detection

If the URL matches `x.com/*/status/*` or `twitter.com/*/status/*`:
- Use the Grok MCP tool (`mcp__grok__get_tweet` or similar) to fetch the tweet
- Extract: author, text, date, any media descriptions
- If Grok MCP is not available, fall back to WebFetch with the tweet URL and note `source-type: tweet` in frontmatter

### Step 2 — GitHub repo URLs

Use WebFetch with prompt:

> "Extract from this GitHub repository: name, description, key technologies, main purpose, README content. Format as markdown."

### Step 3 — General URLs

Use WebFetch with prompt:

> "Extract the complete article content from this page. Return: title, author(s) if listed, date published if listed, and the full article text preserving all factual claims, data points, code examples, and technical details. Format as clean markdown."

### Step 4 — Failure handling

If WebFetch fails (auth wall, paywall, 404):
- Report the failure with the URL
- Suggest: paste content manually via `/wiki:ingest "text" --title "Title"`
- Do not create a stub without content

---

## File Ingestion

1. Read the file directly using the Read tool
2. Markdown files → preserve all formatting as-is
3. Plain text → wrap in markdown, preserve paragraph breaks
4. JSON/CSV/structured data → describe schema + representative sample (not the full dataset)
5. Images → create a metadata stub noting the file path and any visible content description

---

## Freeform Text Ingestion

1. User provides quoted text as the argument to `/wiki:ingest`
2. If `--title` is not provided, derive a title from the first sentence or ask the user
3. Auto-tag based on content keywords

---

## Inbox Processing (`--inbox`)

The `inbox/` directory is a drop zone. Users dump files there manually (via Finder, `cp`, etc.).

### Procedure

1. Scan `inbox/` for all files (exclude `.processed/` subdirectory and hidden files)
2. For each file:
   - `.url` or `.webloc` → extract the URL, then follow URL ingestion flow
   - `.md` or `.txt` → ingest as `notes` or `articles` (auto-detect by content)
   - `.pdf` → create a metadata stub, note the file path for reference
   - `.json`, `.csv`, `.tsv` → ingest as `data`
   - Other file types → create a metadata stub noting file type and path
3. Move each processed file to `inbox/.processed/` (or delete if user did not pass `--keep`)
4. Report each item processed with its destination path
5. If 5 or more items were processed, suggest running `/wiki:compile`

---

## Slug Generation

1. Take the title, lowercase, replace spaces with hyphens, remove all special characters except hyphens
2. Prepend today's date: `YYYY-MM-DD-`
3. Truncate the slug portion to 60 characters max (not counting date prefix or `.md` extension)
4. Example: `"Attention Is All You Need"` → `2026-04-06-attention-is-all-you-need.md`
5. If a file with that slug already exists, append `-2`, `-3`, etc.

---

## Output File Format

Write to `raw/{type}/YYYY-MM-DD-slug.md` with this structure:

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

```markdown
# Title

[Full content, preserved from source or extracted]
```

See `references/wiki-structure.md` for the complete frontmatter schema.

---

## Post-Ingestion Index Updates

After writing each source file, update indexes in this order:

1. `raw/{type}/_index.md` — add row to Contents table
2. `raw/_index.md` — add row to Contents table
3. `_index.md` (master) — increment source count, add to Recent Changes, update "Last updated"

See `references/indexing.md` for the full index update procedure.

---

## Batch Ingestion

If the user provides multiple URLs or paths (comma-separated, space-separated, or one per line):
- Process each sequentially
- Report progress after each item (path written, type detected)
- At the end, summarize: N items ingested

---

## Compilation Nudge

After ingestion completes, count uncompiled sources: sources with `ingested` date after the `Last compiled` date in master `_index.md`. If 5 or more uncompiled sources exist, suggest running `/wiki:compile`.
