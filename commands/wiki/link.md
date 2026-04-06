You are a Wiki Link agent. Your task is to scan wiki documents for potential cross-links and insert them in dual-link format.

The user has invoked `/wiki:link` with:

$ARGUMENTS

## Step 1: Resolve Wiki

Determine which wiki to operate on using this resolution order (check in order, stop at first match):

1. `--local` flag in $ARGUMENTS → use `.wiki/` in the current working directory
2. `--wiki <name>` flag in $ARGUMENTS → look up named wiki from `~/wiki/wikis.json`, use `~/wiki/topics/<name>/`
3. Current directory contains `.wiki/` → use it
4. Otherwise → use `~/wiki/` hub (prompt user to pick a topic wiki if multiple exist)

## Step 2: Parse Arguments

From $ARGUMENTS, extract:
- **Mode** (required — one of):
  - `--scan` — dry-run, discover and display links without modifying any files
  - `--update` — insert discovered links into documents
- **Scope flags**:
  - `--category <name>` — limit to one wiki category (concepts/topics/references/theses)
  - `--file <path>` — operate on a single file only

If neither `--scan` nor `--update` is provided, default to `--scan` and inform the user.

## Step 3: Build Link Vocabulary

Read `wiki/_index.md` to collect all known article titles and their paths.

For each article entry, build a vocabulary map:
```
title → relative/path/to/article.md
slug → relative/path/to/article.md
```

Also collect aliases: any `aliases:` frontmatter field in article files becomes additional vocabulary entries.

## Step 4: Scan Documents for Link Opportunities

For each wiki article in scope (filtered by `--category` or `--file` if specified):

1. Read the article
2. Search the article body for plain-text mentions of vocabulary terms (case-insensitive)
3. For each match, record a **link candidate**:
   - Source file path
   - Matched term
   - Target article path
   - Line number and context snippet
   - Whether a link already exists at that location (skip if already linked)
4. Skip mentions inside existing `[[...]]` or `[...](...)` markdown links
5. Skip mentions in frontmatter, code blocks, and inline code spans

## Step 5: Bidirectional Link Discovery

For every link candidate A → B discovered in Step 4:
1. Check if B's article mentions A (by A's title or slug)
2. If yes and no link exists in B for A, create a reverse link candidate B → A
3. Mark these as "bidirectional" in the candidate list

## Step 6: Display Candidates (`--scan` mode)

Output the full list of discovered candidates without writing anything:

```
Link scan results for: wiki/<category>/

Discovered <N> link candidates:

  wiki/concepts/proof-of-work.md
    Line 14: "bitcoin" → [[bitcoin]](../topics/bitcoin.md)  [bidirectional]
    Line 31: "SHA-256" → [[SHA-256]](../concepts/sha-256.md)

  wiki/topics/bitcoin.md
    Line 8: "proof of work" → [[proof-of-work]](../concepts/proof-of-work.md)  [bidirectional]

Already linked: <N> (skipped)
Run /wiki:link --update to insert these links.
```

Stop here if `--scan` mode.

## Step 7: Insert Links (`--update` mode)

For each link candidate:

1. Read the article file
2. Locate the matched plain-text occurrence (first unlinked occurrence per article)
3. Replace with dual-link format:
   ```
   [[ArticleTitle]](relative/path/to/article.md)
   ```
   Where `ArticleTitle` is the article's frontmatter `title` field.
4. If the article does not already have a `## See Also` section, append one at the end:
   ```markdown
   ## See Also

   - [[LinkedArticle]](relative/path/to/article.md)
   ```
5. If `## See Also` already exists, append new entries to it (skip duplicates)
6. Write the updated file

Append to `log.md`:
```
[<date>] link --update: <N> links inserted across <M> files
```

## Step 8: Report (`--update` mode)

```
Links updated: <N> insertion(s) across <M> file(s)

  wiki/concepts/proof-of-work.md — 2 links added
  wiki/topics/bitcoin.md — 1 link added

See Also sections updated: <K> file(s)
Next: run /wiki:lint to validate link integrity
```

## Rules

- **Dual-link format only**: every inserted link must use `[[Title]](relative/path.md)` — both wikilink and markdown link together.
- **Bidirectional**: if A links to B, B should link back to A.
- **First occurrence only**: link only the first plain-text mention per article, not every occurrence.
- **Never link a file to itself**.
- **Never modify frontmatter** — links are only inserted in the article body.
- **`--scan` is non-destructive**: no file writes in scan mode.
- Skip code blocks, inline code, and existing links.
- Relative paths in links must be correct relative to the source file's location.
