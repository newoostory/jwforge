---
description: One-time project analysis — writes a split set of files under .jwforge/ (overview + module map, plus optional api-map / data-model). Persistent across /work cycles.
argument-hint: [--force]
---

You are running the **analyze** step of the jwforge flow. Produce a persistent set of analysis files under `.jwforge/`. These survive across `/work` cycles and are updated incrementally by `/work` — do not re-run unless the user explicitly wants a fresh analysis.

## File set produced

Always:
- `.jwforge/project-analysis.md` — thin overview (stack, conventions, lint, test framework). Always-loaded.
- `.jwforge/module-map.md` — per-module: files, role, exports, imports, imported-by. Loaded selectively by consumers.
- `.jwforge/.analysis-meta.json` — index + tree hash + timestamps.

Conditionally (only if applicable to this project):
- `.jwforge/api-map.md` — HTTP routes / events / scheduled jobs / CLI surface.
- `.jwforge/data-model.md` — entities / DB schema / migrations.

The `files` field in `.analysis-meta.json` records which optional files exist.

## Step 1 — Guard against wasted work

1. Ensure `.jwforge/` exists (`mkdir -p .jwforge`).
2. Detect if this looks like an existing project:
   - Existing = ≥10 code files (`*.py *.ts *.tsx *.js *.jsx *.go *.rs *.java *.kt *.rb *.php *.cs *.cpp *.c *.swift`) **or** any of: `package.json pyproject.toml Cargo.toml go.mod pom.xml Gemfile composer.json`.
   - If **not** existing → tell the user "this looks like a new project, analysis is skipped — run `/jwplan` directly" and stop.
3. If `.jwforge/project-analysis.md` already exists and `$ARGUMENTS` does **not** contain `--force` → print "already analyzed (see `.jwforge/`). Use `/jwanalyze --force` to redo." and stop.

## Step 2 — Run the analyzer agent

Spawn the **project-analyzer** subagent in **full mode** with this prompt:

> Run a full project analysis of the current working directory. Follow your agent spec strictly. Produce the file set described in your spec: `.jwforge/project-analysis.md`, `.jwforge/module-map.md`, optionally `.jwforge/api-map.md` and `.jwforge/data-model.md` (only if applicable), plus `.jwforge/.analysis-meta.json` with a complete `files` index. Be factual and scannable. The module map will be used by `/jwplan` to predict which files each plan slice touches — accuracy and `Imports from` / `Imported by` cross-links matter.

Use the `Agent` tool with `subagent_type: "project-analyzer"`. Run foreground.

## Step 3 — Confirm

After the agent returns:
- Read `.jwforge/.analysis-meta.json` and report which files were produced.
- Read back a one-paragraph summary of what was detected (stack, test framework, lint tools, module count).
- Print a one-liner: "Analysis saved. Next: `/jwplan`."

## Invariants

- Never write anywhere outside `.jwforge/`.
- Never modify `current/` or `archive/`.
- The schema of each analysis file is fixed by the `project-analyzer` agent's spec. Other tooling depends on the layout — do not let the agent improvise structure.
- Optional files (`api-map.md`, `data-model.md`) must NOT be created when there is nothing to put in them. Their absence is signalled by `null` in `.analysis-meta.json`'s `files` index.
