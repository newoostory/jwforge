---
description: One-time project analysis — writes .jwforge/project-analysis.md (persistent, not archived)
argument-hint: [--force]
---

You are running the **analyze** step of the jwforge flow. Produce a single, persistent `.jwforge/project-analysis.md` plus `.jwforge/.analysis-meta.json`. This file survives across `/work` cycles and is updated incrementally by `/work` — do not re-run unless user explicitly wants a fresh analysis.

## Step 1 — Guard against wasted work

1. Ensure `.jwforge/` exists (`mkdir -p .jwforge`).
2. Detect if this looks like an existing project:
   - Existing = ≥10 code files (`*.py *.ts *.tsx *.js *.jsx *.go *.rs *.java *.kt *.rb *.php *.cs *.cpp *.c *.swift`) **or** any of: `package.json pyproject.toml Cargo.toml go.mod pom.xml Gemfile composer.json`.
   - If **not** existing → tell the user "this looks like a new project, analysis is skipped — run `/jwplan` directly" and stop.
3. If `.jwforge/project-analysis.md` already exists and `$ARGUMENTS` does **not** contain `--force` → print "already analyzed (see path). Use `/jwanalyze --force` to redo." and stop.

## Step 2 — Run the analyzer agent

Spawn the **project-analyzer** subagent in **full mode** with this prompt:

> Run a full project analysis of the current working directory. Follow your agent spec strictly. Write the result to `.jwforge/project-analysis.md` using the fixed schema. Also write `.jwforge/.analysis-meta.json` with `{"generated_at": "<ISO8601>", "tree_hash": "<sha256 of sorted code file paths>", "covered_paths": [...]}`. Keep output concise and scannable.

Use the `Agent` tool with `subagent_type: "project-analyzer"`. Run foreground (we need the result before returning).

## Step 3 — Confirm

After the agent returns:
- Read back a one-paragraph summary of what was detected (stack, test framework, lint tools).
- Print a one-liner: "Analysis saved. Next: `/jwplan`."

## Invariants

- Never write anywhere outside `.jwforge/`.
- Never modify `current/` or `archive/`.
- The schema of `project-analysis.md` must contain exactly these top-level H2 sections: `Stack`, `Structure`, `Entry Points`, `Test Framework`, `Conventions`, `Lint Tools`. Other tooling depends on this layout.
