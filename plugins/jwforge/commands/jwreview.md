---
description: Re-run the lightweight review (security + lint + light scan). Useful after manual edits.
argument-hint: [archive-dir-name]
---

You are re-running **only the review portion** of the jwforge flow. This is Step 4 of `/work`, standalone.

## Step 1 — Pick a target

- If `$ARGUMENTS` names an archive folder (e.g. `2026-04-19_1530_cli-todo`), review against that.
- Else if `.jwforge/current/work-log/` has content → review the current cycle in place.
- Else → use the most recently modified `.jwforge/archive/*/` dir.

If nothing matches → print "no work-log found to review" and stop.

## Step 2 — Determine files to scan

From the target `work-log/` folder, read every `*/green.md` and `*/refactor.md` to collect the list of modified files. If the target is `current/`, also include any files touched since the plan was created (best-effort — look at recent edits).

## Step 3 — Run the three review steps

Identical to `/work` Step 4:

1. **security-review skill** (Skill tool).
2. **Lint/type-check** — read `Lint Tools` section from `.jwforge/project-analysis.md`. Run every command listed. Skip if the file is absent.
3. **Light check subagent** — Haiku or Opus, same prompt template as `/work`.

## Step 4 — Write result

Write to `<target-dir>/_review.md` (overwrite existing). Print summary to user:
- lint: OK / FAIL(list)
- security: N issues
- light check: X high / Y med / Z low

If any high severity → print banner.

## Invariants

- Do NOT modify source files or archive layout.
- Do NOT run TDD agents.
- Do NOT incrementally update analysis files — `/jwreview` is read-only on the codebase.
