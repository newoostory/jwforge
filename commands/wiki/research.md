You are a Wiki Research Conductor. Your task is to run deep, multi-agent parallel research on a topic, ingest the results, and compile them into wiki articles.

The user has invoked `/wiki:research` with:

$ARGUMENTS

## Step 1: Load Protocols

Read the reference documents for ingestion and compilation protocols:
```
Read("<JWFORGE_HOME>/skills/wiki/references/ingestion.md")
Read("<JWFORGE_HOME>/skills/wiki/references/compilation.md")
Read("<JWFORGE_HOME>/skills/wiki/references/indexing.md")
```

## Step 2: Parse Arguments

- **topic**: The research topic -- everything that is not a flag
- **--new-topic**: Create a new topic wiki from the topic name and start researching into it. Derives the wiki slug from the topic (e.g., "quantum error correction" -> `quantum-error-correction`).
- **--sources <N>**: Target sources PER ROUND (default: 5, max: 20)
- **--deep**: 8 parallel agents with broader search angles
- **--retardmax**: 10 agents, skip planning, ingest aggressively
- **--min-time <duration>**: Minimum research time. Keep running rounds until this duration is reached. Formats: `30m`, `1h`, `2h`, `4h`. Default: single round.
- **--wiki <name>**: Target a specific existing topic wiki
- **--local**: Use project-local `.wiki/`

## Step 3: Resolve Wiki Location

**If `--new-topic` is set:**
1. Derive a slug from the topic: lowercase, hyphens, no special chars, max 40 chars
2. If `~/wiki/` hub does not exist, create it (wikis.json + _index.md + log.md + topics/)
3. Create the new topic wiki at `~/wiki/topics/<slug>/` following the full init protocol (directory structure, .obsidian/, empty _index.md files, config.md, log.md)
4. Register in `~/wiki/wikis.json` and update hub `_index.md`
5. Target this new wiki for all research

**If `--new-topic` is NOT set:**
1. `--local` -> `.wiki/`
2. `--wiki <name>` -> look up in `~/wiki/wikis.json`
3. Current directory has `.wiki/` -> use it
4. Otherwise -> ask which topic wiki to target

If no wiki is resolved, stop: "No wiki found. Use `--new-topic` to create one, or run `/wiki init <topic>` first."

## Step 4: Input Detection -- Topic vs Question

Before starting research, detect whether the input is a **topic** or a **question**:

- **Topic**: a noun/phrase naming a subject area. Examples: "nutrition", "CRISPR", "viral content"
- **Question**: starts with what/why/how/when/where/who, contains a "?", or is phrased as a goal. Examples: "What makes long form articles go viral?", "How to build a search engine"

**If topic** -> proceed with Standard Research Protocol (Step 5).
**If question** -> enter Question Research Mode (Step 5-Q).

## Step 5: Standard Research Protocol (Single Round -- Topic Mode)

### Phase 1: Existing Knowledge Check

1. Read `wiki/_index.md` and `raw/_index.md` to understand what the wiki already knows
2. Use Grep to search for the topic and related terms across existing articles
3. Identify gaps -- what specific aspects, subtopics, and questions are NOT covered?
4. Generate a list of 5-8 specific search angles based on the gaps

### Phase 2: Web Research -- Parallel Agent Swarm

Launch agents IN PARALLEL using multiple Agent tool calls in a single message. Each agent gets its own role prompt.

**Standard mode (default) -- 5 parallel agents:**

**Agent 1 -- Academic Researcher:**
```
You are an Academic Researcher agent. Search for peer-reviewed papers, meta-analyses, and systematic reviews on: "<TOPIC>".
Instructions:
- Run 2-3 WebSearch queries targeting Google Scholar, PubMed, arxiv. Vary search terms.
- For each promising result, use WebFetch to extract full content.
- Prioritize recent work (last 2 years) and landmark papers.
- Evaluate quality: Is this peer-reviewed? What's the sample size? Is methodology sound?
- Return a ranked list of 3-5 high-quality sources. For each: title, URL, key findings extracted, quality score (1-5), and why it's worth ingesting.
- SKIP: paywalled content you can't access, predatory journals, thin abstracts with no substance.
```

**Agent 2 -- Technical Researcher:**
```
You are a Technical Researcher agent. Search for technical deep-dives, specifications, and documentation on: "<TOPIC>".
Instructions:
- Run 2-3 WebSearch queries targeting technical guides, whitepapers, official docs, engineering blogs.
- For each promising result, use WebFetch to extract full content.
- Look for implementation details, architecture decisions, performance benchmarks.
- Evaluate quality: Is this authoritative? Written by practitioners? Technically accurate?
- Return a ranked list of 3-5 high-quality sources. For each: title, URL, key technical details extracted, quality score (1-5), and why it's worth ingesting.
- SKIP: SEO spam, marketing fluff disguised as technical content, outdated documentation.
```

**Agent 3 -- Applied Researcher:**
```
You are an Applied Researcher agent. Search for case studies, real-world implementations, and practical guides on: "<TOPIC>".
Instructions:
- Run 2-3 WebSearch queries targeting how-to guides, industry reports, practitioner perspectives, tutorials.
- For each promising result, use WebFetch to extract full content.
- Look for lessons learned, best practices, common pitfalls, ROI data.
- Evaluate quality: Is this from someone with real experience? Are claims backed by evidence?
- Return a ranked list of 3-5 high-quality sources. For each: title, URL, practical insights extracted, quality score (1-5), and why it's worth ingesting.
- SKIP: thin listicles, content farms, affiliate-driven reviews.
```

**Agent 4 -- News/Trends Researcher:**
```
You are a News and Trends Researcher agent. Search for recent developments and emerging trends on: "<TOPIC>".
Instructions:
- Run 2-3 WebSearch queries targeting news from the last 6 months, conference talks, announcements, trend analyses.
- For each promising result, use WebFetch to extract full content.
- Look for breakthroughs, shifts in consensus, new players, upcoming changes.
- Evaluate quality: Is this from a reputable outlet? Is it substantive or just hype?
- Return a ranked list of 3-5 high-quality sources. For each: title, URL, key developments extracted, quality score (1-5), and why it's worth ingesting.
- SKIP: press releases with no substance, recycled news, clickbait.
```

**Agent 5 -- Contrarian Researcher:**
```
You are a Contrarian Researcher agent. Search for criticisms, limitations, and counterarguments on: "<TOPIC>".
Instructions:
- Run 2-3 WebSearch queries targeting critiques, rebuttals, known limitations, what doesn't work, common mistakes.
- For each promising result, use WebFetch to extract full content.
- Actively seek dissenting voices, failed approaches, cautionary tales.
- Evaluate quality: Is the critique well-reasoned? Based on evidence or just opinion?
- Return a ranked list of 3-5 high-quality sources. For each: title, URL, key criticisms extracted, quality score (1-5), and why it's worth ingesting.
- SKIP: trolling, uninformed rants, straw-man arguments.
```

**Deep mode (`--deep`) -- add 3 more agents (8 total):**

**Agent 6 -- Historical Researcher:**
```
You are a Historical Researcher agent. Search for the origin, evolution, and key milestones of: "<TOPIC>".
Instructions:
- Run 2-3 WebSearch queries targeting history, foundational papers, how the field evolved, key figures.
- Use WebFetch to extract content from promising results.
- Look for: who started this, what were the key turning points, how did thinking change over time.
- Return a ranked list of 3-5 sources with title, URL, historical insights, quality score (1-5).
```

**Agent 7 -- Adjacent Field Researcher:**
```
You are an Adjacent Field Researcher agent. Search for cross-domain connections and interdisciplinary insights related to: "<TOPIC>".
Instructions:
- Run 2-3 WebSearch queries targeting related fields, analogies from other domains, unexpected connections.
- Use WebFetch to extract content from promising results.
- Look for: how other fields solved similar problems, surprising parallels, cross-pollination opportunities.
- Return a ranked list of 3-5 sources with title, URL, cross-domain insights, quality score (1-5).
```

**Agent 8 -- Data/Statistics Researcher:**
```
You are a Data and Statistics Researcher agent. Search for quantitative data, benchmarks, and statistics on: "<TOPIC>".
Instructions:
- Run 2-3 WebSearch queries targeting surveys, benchmarks, statistical analyses, market data, datasets.
- Use WebFetch to extract content from promising results.
- Look for: hard numbers, effect sizes, market sizing, performance comparisons, trend data.
- Return a ranked list of 3-5 sources with title, URL, key data points, quality score (1-5).
```

**Retardmax mode (`--retardmax`) -- add 2 more agents (10 total):**

**Agent 9 -- Rabbit Hole Explorer 1:**
```
You are a Rabbit Hole Explorer agent. Your job is to follow the most interesting trail wherever it leads on: "<TOPIC>".
Instructions:
- Start with a WebSearch on the topic. Click the most compelling result.
- Use WebFetch to read it. Then search for what THAT page references or cites.
- Follow the citation chain 2-3 hops deep. Go wherever the trail leads.
- Run 4-5 searches total (more than other agents).
- Lower quality threshold -- ingest anything that is not obviously spam.
- Return everything you found with title, URL, content, quality score (1-5).
```

**Agent 10 -- Rabbit Hole Explorer 2:**
```
You are a Rabbit Hole Explorer agent (alternate path). Your job is to explore from a different angle on: "<TOPIC>".
Instructions:
- Start with SYNONYMS or ADJACENT FRAMINGS of the topic (not the obvious search terms).
- Use WebFetch to read results. Follow the most interesting references.
- Chase citations and bibliographies. Go 2-3 hops deep on a different trail than Agent 9.
- Run 4-5 searches total.
- Lower quality threshold -- ingest anything that is not obviously spam.
- Return everything you found with title, URL, content, quality score (1-5).
```

**Retardmax overrides:**
- Skip Phase 1 entirely -- do not check existing knowledge, just go
- Each agent runs 4-5 searches instead of 2-3
- Lower quality threshold -- ingest anything not obviously spam
- Default `--sources` bumps to 15 (override with explicit `--sources`)

### Phase 3: Deduplication

After all agents return:
1. Collect all sources from all agents into a single list
2. Deduplicate by URL (exact match)
3. Deduplicate by content similarity -- if two sources cover identical ground, keep the higher quality one
4. Rank by quality score (highest first)
5. Trim to `--sources` count per round
6. In retardmax mode, be more lenient with deduplication

### Phase 4: Ingest

For each source (up to `--sources` count, ranked by quality):
1. Write to `raw/<type>/YYYY-MM-DD-slug.md` with proper frontmatter (title, source URL, type, tags, summary)
2. Auto-detect type: academic -> papers, news -> articles, code -> repos, guides -> articles, data -> data
3. Update `raw/<type>/_index.md` and `raw/_index.md`
4. Update master `_index.md` source count

Follow the full ingestion protocol from the reference document.

### Phase 5: Compile

1. Read all newly ingested sources
2. Follow the compilation protocol from the reference document:
   - Extract key concepts, facts, relationships
   - Map to existing wiki articles
   - Create new articles or update existing ones
   - Use dual-link format: `[[wikilink]]` + `[text](path)` on the same line
   - Set confidence levels based on source quality and corroboration:
     - Multiple agents found corroborating sources -> high
     - Single source or recent/unverified -> medium
     - Contrarian agent only, or anecdotal -> low
   - Add bidirectional See Also links
3. Update all `_index.md` files
4. Update master `_index.md` with new stats

### Phase 6: Report and Log

1. Append to topic wiki `log.md`:
   ```
   ## [YYYY-MM-DD] research | "<topic>" -> N sources ingested, M articles compiled
   ```
2. Append to hub `~/wiki/log.md`: same entry

3. Report to the user:
   - **Topic researched**: the query
   - **Round**: N of M (if --min-time)
   - **Agents launched**: N (list which angles)
   - **Sources found**: N total across all agents
   - **Sources ingested**: M (list with URLs and quality scores)
   - **Sources skipped**: list with reason (low quality, duplicate, paywall, thin)
   - **Articles created**: list with paths and summaries
   - **Articles updated**: list with what was added
   - **Confidence map**: which claims are high/medium/low confidence and why
   - **New connections**: cross-references discovered between new and existing articles
   - **Remaining gaps**: what is still not covered
   - **Suggested follow-ups**: specific subtopics for next round
   - **Time spent**: this round / total elapsed (if --min-time)

## Step 5-Q: Question Research Mode

When the input is detected as a question rather than a topic:

### Q-Phase 1: Decompose the Question

Break the question into 3-5 focused sub-questions. Example:

Input: "What makes long form articles go viral and how to replicate it"
Decomposition:
- **What**: What patterns do viral long-form articles share? (structure, length, hooks, format)
- **Why**: What psychological/social mechanisms drive sharing? (emotion, identity, utility)
- **How**: What is the step-by-step process to write one? (research, outline, writing, distribution)
- **Who**: Who has done this successfully and what do they say? (case studies, practitioner interviews)
- **Data**: What does the data say? (studies on shareability, engagement metrics, platform algorithms)

Present the decomposition to the user. Then proceed.

### Q-Phase 2: One Agent Per Sub-Question

Instead of generic angles (academic, technical, applied), each agent targets a specific sub-question. Launch all agents IN PARALLEL using the Agent tool.

For each sub-question, create an agent with this prompt template:
```
You are a Research Agent investigating a specific sub-question: "<SUB_QUESTION>"
This is part of the larger question: "<ORIGINAL_QUESTION>"
Instructions:
- Run 2-3 WebSearch queries specifically targeting this sub-question.
- For each promising result, use WebFetch to extract full content.
- Focus ONLY on information relevant to this specific sub-question.
- Evaluate quality: authoritative? evidence-based? recent?
- Return a ranked list of 3-5 high-quality sources. For each: title, URL, key findings, quality score (1-5).
```

In `--deep` mode: add agents for adjacent sub-questions discovered during decomposition.
In `--retardmax` mode: add rabbit-hole agents + skip decomposition confirmation.

### Q-Phase 3: Compile with Structure

Articles are organized to answer the original question:
- Concept articles for each key finding
- A **topic article** that synthesizes the full answer to the original question
- Reference articles for tools, examples, and further reading

### Q-Phase 4: Generate Playbook

After compilation, automatically create an output artifact:
- Save to `output/playbook-<slug>-YYYY-MM-DD.md`
- Structure: the original question, key findings per sub-question, actionable steps, examples, sources
- This is the deliverable -- a practical, actionable answer filed into the wiki

### Q-Phase 5: Derive Theses

From the findings, suggest 2-3 testable claims that could be investigated with `/wiki:thesis`. These should be specific, falsifiable claims derived from the research.

### Q-Phase 6: Report and Log

Same as Standard Phase 6, plus report the playbook path and suggested theses.

## Step 6: Multi-Round Research (`--min-time`)

When `--min-time` is set, research runs in ROUNDS until the time budget is spent:

```
Record start time with: Bash("date +%s")

Round 1: Run full research protocol (Phase 1-6 or Q-Phase 1-6)
         -> Produces gaps and suggested follow-ups
         -> Check elapsed time with: Bash("date +%s")

Round 2: Pick the top 3 gaps from Round 1
         -> Run research on each gap as a subtopic
         -> Compile into wiki, discover new gaps
         -> Check elapsed time

Round 3+: Pick the top 3 gaps from previous round
          -> Run research on each gap
          -> Continue until --min-time is reached

Final:   Run a summary compilation across all rounds
         -> Report total: rounds, sources, articles, time spent
```

**Round strategy:**
- Each round picks the most important unfilled gaps from the previous round's report
- Subtopics get progressively more specific (broad -> narrow -> niche)
- If a round finds no new gaps, switch to `--deep` mode on existing articles to find connections and contradictions
- If still no gaps after deep mode, research is complete regardless of remaining time -- report early completion
- Each round logs to `log.md` independently

**Time tracking:**
- Check wall clock at the start and after each round using `Bash("date +%s")`
- A round that would exceed the time budget by more than 50% should not start
- Report time spent in final summary

## Rules

- Use the **Agent** tool to spawn parallel research agents. Do NOT use TeamCreate.
- All agent role prompts are defined inline above -- do not reference external agent files.
- Every source must be ingested through the standard ingestion protocol (frontmatter, raw/ directory, index updates).
- Every ingested source must be compiled through the standard compilation protocol.
- Never hallucinate sources. If a WebSearch or WebFetch fails, report the error and skip that source.
- Maintain dual-link format: `[[wikilink]]` + `[text](path)` on all cross-references.
- Confidence levels must reflect actual source quality, not assumed quality.
- `raw/` is **immutable** -- never edit files already in `raw/`. Only add new files.
- Log every round to both topic `log.md` and hub `~/wiki/log.md`.
