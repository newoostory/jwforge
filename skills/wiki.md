---
name: wiki
description: "LLM-compiled knowledge base manager. Activates for wiki directories, /wiki commands, or keywords like wiki, knowledge base, ingest, compile wiki."
user-invocable: true
argument-hint: "<command> [args]"
---

# Wiki Manager

You manage an LLM-compiled knowledge base system. This skill activates for `/wiki` commands, ambient wiki-related queries, and structural guardianship of wiki directories.

Wiki is **standalone** — no JWForge pipeline state, no hooks, no teams. All operations run as Conductor-direct or via Agent tool for parallel research.

---

## Command Routing

| Command | Purpose |
|---------|---------|
| `/wiki init <topic> [--local]` | Create a new topic wiki with full directory structure |
| `/wiki status` | Show wiki hub overview, topic counts, local wiki status |
| `/wiki link [--scan\|--update]` | Discover and insert wikilinks between articles (bidirectional) |
| `/wiki sync [--setup\|--now\|--log]` | Git-push based one-way sync to remote repository |
| `/wiki ingest <source>` | Ingest URLs, files, text, inbox items into `raw/` |
| `/wiki compile [--full] [--code]` | Compile raw sources into wiki articles |
| `/wiki query <question>` | Query wiki with citations (quick/standard/deep) |
| `/wiki search <term>` | Search wiki by keyword, tag, category |
| `/wiki lint [--full]` | Health checks: structure, links, frontmatter, coverage |
| `/wiki output <type>` | Generate artifacts: summary, report, slides |
| `/wiki research <topic>` | Multi-agent web research (5/8/10 parallel agents) |
| `/wiki thesis <claim>` | Thesis-driven research with verdict |
| `/wiki assess <repo>` | Compare repo against wiki + market intelligence |

---

## Detailed Logic

Full protocol for each subcommand, wiki resolution order, ambient activation, structural guardian rules, confidence scoring, and activity logging:

```
Read("skills/wiki/SKILL.md")
```

(install.sh patches this path at install time)

---

## Key Principles

1. **Index-first navigation** — Always read `_index.md` before scanning directories. Never Glob when an index exists.
2. **Immutable raw sources** — Content in `raw/` is never modified after ingestion.
3. **Token efficiency** — Prefer `_index.md` summaries over full articles; full articles over raw sources. The 3-hop strategy minimizes token consumption.
4. **Karpathy-inspired synthesis** — Wiki articles are synthesized knowledge (textbook entries), not copies of sources.
5. **Dual-linking** — Every cross-reference uses both `[[WikiLink]]` and `[text](path.md)` on the same line.
6. **Obsidian compatible** — Frontmatter, vault config, and link format are compatible with Obsidian.
7. **Incremental compilation** — Only process new/uncompiled sources by default. Use `--full` to recompile everything.
8. **Honest gaps** — Never fabricate. State when the wiki lacks an answer. Note confidence levels.
