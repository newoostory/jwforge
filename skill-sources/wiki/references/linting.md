# Linting Rules

Reference: complete check catalog, severity levels, auto-fix rules, and report format for `/wiki:lint`.

---

## Severity Levels

| Level | Meaning |
|-------|---------|
| **Critical** | Broken functionality — missing indexes, broken links, corrupted frontmatter |
| **Warning** | Inconsistency — mismatched counts, stale dates, non-bidirectional links |
| **Suggestion** | Improvement opportunity — new connections, missing tags, content gaps |

Lint never blocks the user. Critical issues are reported and auto-fixed when `--fix` is passed; otherwise reported for manual action.

---

## Check Catalog

### C1: Structure (Critical)

- [ ] Master `_index.md` exists at wiki root
- [ ] `config.md` exists at wiki root
- [ ] `log.md` exists at wiki root
- [ ] Every subdirectory under `raw/` has `_index.md` (`articles/`, `papers/`, `repos/`, `notes/`, `data/`)
- [ ] Every subdirectory under `wiki/` has `_index.md` (`concepts/`, `topics/`, `references/`, `theses/`)
- [ ] `output/` has `_index.md`
- [ ] Every `.md` file (excluding `_index.md` and `config.md`) has valid YAML frontmatter delimited by `---`

### C2: Frontmatter Schema (Critical/Warning)

**Raw sources** — all of these fields must be present and non-empty:
- [ ] `title`
- [ ] `source`
- [ ] `type` — must be one of: `articles`, `papers`, `repos`, `notes`, `data`
- [ ] `ingested` — valid `YYYY-MM-DD` date
- [ ] `tags` — non-empty list
- [ ] `summary` — non-empty string

**Wiki articles** — all of these fields must be present and non-empty:
- [ ] `title`
- [ ] `category` — must be one of: `concept`, `topic`, `reference`
- [ ] `sources` — non-empty list
- [ ] `created` — valid `YYYY-MM-DD` date
- [ ] `updated` — valid `YYYY-MM-DD` date
- [ ] `tags` — non-empty list
- [ ] `summary` — non-empty string
- [ ] `confidence` — must be one of: `high`, `medium`, `low`

Note: `aliases` in wiki articles is recommended but not required.

### C3: Index Consistency (Warning)

- [ ] Every `.md` file in a directory appears in that directory's `_index.md` Contents table
- [ ] No `_index.md` references a non-existent file (dead entries)
- [ ] Statistics in master `_index.md` match actual file counts (Sources, Articles, Outputs)
- [ ] "Last compiled" date is present and valid in master `_index.md`
- [ ] "Last lint" date is present and valid in master `_index.md`

### C4: Link Integrity (Warning)

- [ ] All markdown links `[text](path)` in wiki articles resolve to existing files
- [ ] All "See Also" links are bidirectional: if article A links to article B, article B must link back to A
- [ ] All "Sources" links in wiki articles point to existing files in `raw/`
- [ ] No broken wikilinks `[[slug]]` — slugs must match an existing article filename

### C5: Tag Hygiene (Warning)

- [ ] No near-duplicate tags (e.g., `ml` and `machine-learning`, `nlp` and `natural-language-processing`)
- [ ] Tags in article frontmatter are consistent with the tag vocabulary used across the wiki
- [ ] Tags in index Contents table rows match the article's actual frontmatter tags
- [ ] When near-duplicates are found, report the canonical form (the more specific/longer form)

### C6: Coverage (Suggestion)

- [ ] Every raw source is referenced by at least one wiki article's `sources` field
- [ ] No wiki article has an empty `sources` list
- [ ] Articles with overlapping tags that don't link to each other via "See Also" — suggest the connection
- [ ] Orphan articles: wiki articles with no incoming "See Also" links from any other article

### C7: Deep Checks (`--deep` only, Suggestion)

- [ ] Use WebSearch to verify key factual claims in wiki articles
- [ ] Identify articles that could be enhanced with newer information (source `ingested` date > 6 months ago with no recent compilation)
- [ ] Suggest new articles that would connect existing ones (conceptual gaps)
- [ ] Check for stale sources: ingested > 6 months ago, no newer source covers the same topic

---

## Auto-Fix Rules (`--fix` flag)

| Issue | Auto-Fix Action |
|-------|----------------|
| Missing `_index.md` in a directory | Generate from directory contents (read frontmatter of each file, build Contents table) |
| File not listed in its directory `_index.md` | Add a row using the file's frontmatter `title`, `summary`, `tags` |
| Dead entry in `_index.md` (file doesn't exist) | Remove the row |
| Statistics mismatch in master `_index.md` | Recalculate from actual file counts |
| Missing bidirectional "See Also" link | Add the missing "See Also" entry to the article lacking the backlink, using dual-link format |
| Empty `title` field in frontmatter | Infer from the first `# heading` in the file |
| Empty `summary` field in frontmatter | Infer from the first paragraph of body content |
| Near-duplicate tags | Replace all instances of the non-canonical form with the canonical form across all affected files |
| "Last lint" date not set in master `_index.md` | Set to today's date |

Auto-fix does NOT:
- Rewrite or expand article content
- Remove files
- Change `category`, `type`, or `confidence` values
- Modify raw source files (`raw/` is immutable)

---

## Report Format

After every lint run, output a structured report:

```markdown
## Wiki Lint Report — YYYY-MM-DD

**Wiki**: ~/wiki/topics/<name>/ (or .wiki/ for local)

### Summary
- Checks run: N
- Issues found: N (N critical, N warnings, N suggestions)
- Auto-fixed: N  (only if --fix was used)

### Critical Issues
1. [description] — [file path]

### Warnings
1. [description] — [file path]

### Suggestions
1. [suggestion] — [reasoning]

### Coverage
- Sources with no wiki articles: [list or "none"]
- Wiki articles with broken links: [list or "none"]
- Missing bidirectional links: [list or "none"]
- Potential new connections: [list or "none"]
```

After the report, append to `log.md`:
```
## [YYYY-MM-DD] lint | N checks, N critical, N warnings, N suggestions, N auto-fixed
```

And update "Last lint" in master `_index.md`.
