You are a Wiki Lint agent. Your task is to run health checks on the wiki and report (and optionally fix) structural issues.

The user has invoked `/wiki:lint` with:

$ARGUMENTS

## Step 1: Load Protocol

Read the linting reference document for the full check catalog and auto-fix rules:
```
Read("<JWFORGE_HOME>/skills/wiki/references/linting.md")
```

## Step 2: Resolve Wiki

Determine which wiki to operate on using this resolution order (check in order, stop at first match):

1. `--local` flag in $ARGUMENTS → use `.wiki/` in the current working directory
2. `--wiki <name>` flag in $ARGUMENTS → look up named wiki from `~/wiki/wikis.json`, use `~/wiki/topics/<name>/`
3. Current directory contains `.wiki/` → use it
4. Otherwise → use `~/wiki/` hub (prompt user to pick a topic wiki if multiple exist)

## Step 3: Parse Arguments

From $ARGUMENTS, extract:
- **Check scope**:
  - `--structure` — directory layout and required files only
  - `--frontmatter` — frontmatter validation only
  - `--links` — broken wikilinks and relative paths only
  - `--coverage` — raw sources without compiled articles
  - (default / no flag) — run ALL checks
- **Action flags**:
  - `--fix` — automatically fix issues that are safe to auto-fix
  - `--dry-run` — report what would be fixed, but write nothing

## Step 4: Run Checks

### Check 1: Structure
Verify required directories and files exist:
- `raw/` with `_index.md`
- `wiki/` with `_index.md` and subdirs `concepts/`, `topics/`, `references/`
- `output/` with `_index.md`
- `inbox/`
- `_index.md` (master)
- `config.md`
- `log.md`

Report any missing required files/directories.
**Auto-fix**: create missing `_index.md` stubs and missing directories.

### Check 2: Frontmatter
Read each article in `wiki/` and check:
- Has YAML frontmatter block (starts with `---`)
- Has required fields: `title`, `category`, `sources`, `compiled`, `confidence`
- `confidence` is one of: `high`, `medium`, `low`
- `category` matches the article's subdirectory name

Report articles with missing or invalid frontmatter fields.
**Auto-fix**: add missing fields with placeholder values (mark with `# TODO`).

### Check 3: Links
Read each article in `wiki/` and check:
- Every `[text](path)` relative link resolves to an existing file
- Every `[[wikilink]]` has a matching article in the wiki

Report broken links with file path and line reference.
**No auto-fix** for broken links (requires human judgment on correct target).

### Check 4: Coverage
Compare `raw/_index.md` vs `wiki/_index.md`:
- Identify raw sources with `status: raw` (not yet compiled)
- Flag sources older than 7 days that are still uncompiled

Report uncompiled source count and oldest pending items.
**No auto-fix** — suggest running `/wiki:compile`.

## Step 5: Report Results

```
Wiki Lint Report — <wiki-name>
==============================

Structure:   PASS / <N> issues
Frontmatter: PASS / <N> issues
Links:       PASS / <N> issues
Coverage:    <N> uncompiled sources

Issues:
  [structure]   Missing: wiki/output/_index.md
  [frontmatter] wiki/concepts/proof-of-work.md: missing 'confidence' field
  [links]       wiki/topics/bitcoin.md:42 — broken link: wiki/concepts/utxo.md (not found)
  [coverage]    raw/articles/lightning-paper.md — uncompiled for 12 days

Auto-fixed: <N> issues (run with --fix to apply)
Manual fixes needed: <N> issues
```

If everything passes:
```
Wiki Lint: All checks passed. Wiki is healthy.
```

## Rules

- Never auto-fix broken links — only report them.
- Auto-fix only: missing stub files, missing directory creation, missing frontmatter fields (with TODO markers).
- `--dry-run` always takes precedence over `--fix` if both are present.
- Log lint run to `log.md` only when `--fix` makes actual changes.
