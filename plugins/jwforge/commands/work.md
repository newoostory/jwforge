---
description: Execute the approved plan wave-by-wave through the TDD pipeline. Runs items via tdd-item-runner. Optional parallel execution within a wave (gated by pre-flight check). Followed by lightweight review.
---

You are running the **work** step of the jwforge flow. Execute every item in `.jwforge/current/plan.md` through the TDD pipeline without stopping for user input between items. Only interrupt for hard blockers, failed pre-flight checks, or item failures.

## Step 0 — Preconditions

1. Read `.jwforge/current/plan.md`. If missing → tell user to run `/jwplan` and stop.
2. Read `.jwforge/.analysis-meta.json` if present. From its `files` index, collect the absolute paths of the analysis files that exist. Pass this list to `tdd-item-runner` later as `analysis_files`. If no analysis exists, pass an empty list and note "no analysis — lint step will be skipped" for Step 4.
3. Parse plan items in order. Bucket them by `wave`. Order items inside a wave by `id` for determinism.
4. Initialize `.jwforge/current/work-log/` (create if missing).
5. Ensure `.jwforge/worktrees/` is gitignored. If `.gitignore` exists at the project root and does not already contain `.jwforge/worktrees/` (or a broader rule covering it like `.jwforge/`), append the line `.jwforge/worktrees/`. If `.gitignore` does not exist, do **not** create one — tell the user once "consider adding `.jwforge/worktrees/` to your gitignore" and continue.
6. **Re-entry policy** — if `.jwforge/current/work-log/` already contains item dirs from a prior failed `/work` run:
   - For each item dir `NN-<id>/`, treat it as already-completed if and only if it contains `result.json` with `"status": "OK"` or `"status": "OK_WITH_GAPS"`. Anything else (missing files, partial logs, FAIL status) → re-run that item.
   - Skip waves where every item is already-completed.
   - Resume from the first wave with at least one not-yet-completed item.
   - Print one line: "Resuming from wave `<W>` (`<n>` items already complete)."
   - This keeps a long plan from re-doing successful early waves on every retry.

## Step 1 — Pre-flight check (decides parallel vs serial within each wave)

This is the gate that decides whether you may spawn multiple `tdd-item-runner` agents for the same wave concurrently. It is checked **once** at the start of `/work`.

Run these checks in `cwd`:

1. **Working tree clean?**
   ```bash
   git status --porcelain
   ```
   If output is non-empty → tree has uncommitted changes. Set `parallel_safe = false`. Tell the user: "Working tree has uncommitted changes — running serially. Commit or stash first if you want parallel execution."

2. **Heavy dependency dirs in `.gitignore`?**
   Read `.gitignore` (if present). Look for entries that imply per-worktree setup cost: `node_modules`, `venv`, `.venv`, `target`, `build`, `dist`, `__pycache__`, `vendor` (Go module cache), `.bundle`. If any of these match → set `parallel_safe = false` (parallel would require re-installing per worktree). Tell the user: "Project has dependency dirs (`<list>`) that aren't shared across git worktrees. Running serially. Each parallel item would need a fresh dependency install."

3. **All items have `touches_confidence: high`?**
   If the plan has any item with `touches_confidence: low`, set `parallel_safe = false`. Tell the user: "Items with low touches-confidence detected: `<id1>, <id2>, …`. Running serially to avoid surprise file conflicts. (To enable parallel: re-run `/jwplan` and tighten the touches predictions for those items.)"

4. **More than one item per wave anywhere?**
   If every wave has exactly one item, parallelism doesn't matter. Set `parallel_safe = false` silently (no point creating worktrees for a single-item wave).

If all four checks pass → `parallel_safe = true`. Tell the user: "Pre-flight OK. Parallel execution within waves enabled."

If any wave has multiple items but `parallel_safe = false`, you'll execute those waves serially (item by item, in the main working tree). The plan is unchanged — you just collapse parallel waves into a sequence.

## Step 2 — Run each wave

Process waves in ascending order. Inside a wave:

### Wave with one item, OR `parallel_safe = false`

Run each item directly in the main working tree:

1. Make `work_log_dir = .jwforge/current/work-log/<NN>-<id>/` (NN is two-digit position in the plan, 01..). `mkdir -p` it.
2. Spawn `tdd-item-runner` (foreground) with:
   - `workdir` = absolute path of the project root (`pwd`)
   - `item` = the full plan item block
   - `work_log_dir` = absolute path of the dir from step 1
   - `analysis_files` = the list from Step 0
3. The runner returns a one-liner like `OK <path>` or `FAIL <path>`. Read `<work_log_dir>/result.json` for the authoritative status, `actual_touches`, and `touches_drift`. Append both to a running summary.
4. If `status` is anything other than `OK` or `OK_WITH_GAPS` → STOP this `/work` invocation. Print: "Item `<id>` failed at stage `<status>`. See `<work_log_dir>`. Fix and re-run `/work` (Step 0 re-entry will skip completed items)." Skip Step 3/4/5/6 for now. (Plan stays in `current/`, not archived, so `/work` can resume.)
5. Print a status line: `[NN · <id>] wave <W> ✓ (<n> files touched)`.

Move to the next item in the wave, then the next wave.

### Wave with multiple items AND `parallel_safe = true`

For each item in the wave, prepare a git worktree:

1. `worktree_path = .jwforge/worktrees/wave-<W>-<id>/` (absolute path).
2. Record `base_commit = $(git rev-parse HEAD)` once at the start of the wave.
3. For each item: `git worktree add --detach "<worktree_path>" "<base_commit>"`. The worktree is in a detached HEAD at `base_commit`.
4. Make `work_log_dir = .jwforge/current/work-log/<NN>-<id>/`. `mkdir -p`.
5. Spawn `tdd-item-runner` for each item with `run_in_background: true`:
   - `workdir` = `<worktree_path>`
   - `item` = the full plan item block
   - `work_log_dir` = absolute path
   - `analysis_files` = list from Step 0
6. Wait for all background runners to complete. (You will be notified when each finishes — do not poll, just continue to next steps when all are done.)

Once all are done, **collect results**. Each runner wrote `<work_log_dir>/result.json` and returned only a one-liner (`OK <path>` or `FAIL <path>`). Read each `result.json` to get the status and `actual_touches`. Do **not** parse the runner's prose return for status — `result.json` is authoritative.

7. If ANY runner's `result.json` has `status` other than `OK` / `OK_WITH_GAPS`:
   - For each successful runner, capture its full diff (including untracked new files) to `work_log_dir/patch.diff`:
     ```bash
     git -C "<worktree_path>" add -A
     git -C "<worktree_path>" diff --cached "<base_commit>" > "<work_log_dir>/patch.diff"
     ```
   - Cleanup all worktrees: `git worktree remove --force "<worktree_path>"` for each.
   - Print: "Wave <W> failed: item `<id>` returned `<status>`. Successful items' diffs saved to their work-log dirs as `patch.diff`. Fix and re-run `/work` — Step 0's re-entry policy will skip already-completed items."
   - STOP.

8. If ALL succeeded, capture each item's diff (including new files) and apply with 3-way merge to surface conflicts cleanly:
   ```bash
   # capture
   for each item in wave (in id order):
     git -C "<worktree_path>" add -A
     git -C "<worktree_path>" diff --cached "<base_commit>" > "<work_log_dir>/patch.diff"

   # apply, item by item, with 3-way merge so conflicts show up as conflict markers
   for each item in wave (in id order):
     if ! git apply --3way --index "<work_log_dir>/patch.diff"; then
       # 3-way left conflicts in working tree (rare if touches were disjoint)
       abort: print which item conflicted, leave conflict markers in tree, leave already-applied items in place
       cleanup remaining worktrees
       STOP
   ```
   - `git apply --3way --index` falls back to a 3-way merge when straight apply doesn't fit. If conflicts arise, they're left in the working tree as `<<<<<<<` markers — surface this clearly so the user can resolve them. Already-applied items from earlier in the wave stay applied (they're correct); only the conflicting item and any later items need attention.
   - Note: `--index` stages the changes, but `git reset` (if the user wants to start over) un-stages them while keeping the files. We do not commit.

9. After all patches apply (no conflicts):
   ```bash
   git reset                                # un-stage; we leave changes as unstaged edits
   for each worktree:
     git worktree remove --force "<worktree_path>"
   ```

10. Print one status line per item: `[NN · <id>] wave <W> ✓ (<n> files touched)` plus a wave summary: `wave <W>: <n_items> items merged.`

Move to the next wave.

## Step 3 — Touches feedback

After all waves succeed, write `.jwforge/current/work-log/_touches-feedback.md`:

```markdown
# Touches feedback

For items where `actual_touches` differed from `predicted_touches`, the next `/jwplan` run can use this to calibrate.

## <id>
- Predicted: [...]
- Actual:    [...]
- Drift:     [...]
```

Only include items where drift is non-empty. This file is archived with the cycle and the next `/jwplan` should read the most recent archived `_touches-feedback.md` (if any) when predicting touches.

## Step 4 — Light review (after the last wave)

Run in order:

1. **security-review skill**: invoke via the Skill tool. Capture its output.
2. **Lint/type-check**: read `Lint Tools` section from `.jwforge/project-analysis.md`. Run every command listed. Capture pass/fail and first 50 lines of output per tool. Skip if `project-analysis.md` is absent.
3. **Light check subagent**: spawn a fresh Haiku (or Opus if Haiku unavailable) with:
   > Scan the files modified during this /work cycle (list: …) for: hardcoded secrets/tokens, dead imports not caught by linter, obvious performance traps (DB call in loop, N+1). Keep output under 30 lines, flag severity (low/med/high).

Write the combined result to `.jwforge/current/work-log/_review.md`. If any **high** severity issue exists, print a short banner before archiving.

## Step 5 — Incremental analysis update

If `.jwforge/.analysis-meta.json` exists:

Spawn **project-analyzer** in **incremental mode** (foreground) with:
> Update the analysis files in place. Inputs: list of files created/modified/deleted during this /work cycle = `<list>`. Current meta: `<.analysis-meta.json contents>`. Patch only the sections of the affected files (project-analysis.md, module-map.md, optionally api-map.md / data-model.md). Create api-map.md or data-model.md if a new entity/route now requires it; delete the file if its last entry was removed. Update `.analysis-meta.json` with new tree hash, timestamp, and a correct `files` index. Respect the agent's incremental-mode contract.

## Step 6 — Archive

1. Generate `<slug>` from the plan's title or first item id.
2. Create `.jwforge/archive/<YYYY-MM-DD_HHMM>_<slug>/`.
3. Move (not copy) `.jwforge/current/brainstorm.md`, `.jwforge/current/plan.md`, `.jwforge/current/work-log/` into the archive dir.
4. Leave `.jwforge/current/` empty but present.
5. Do NOT move analysis files (`project-analysis.md`, `module-map.md`, `api-map.md`, `data-model.md`, `.analysis-meta.json`).
6. Do NOT move `.jwforge/worktrees/` (it should already be empty after Step 2 cleanup; if not, that's a bug — print a warning and leave it alone).

## Step 7 — Final summary to user

Print a compact summary:
- waves run: W
- items completed: N
- parallel mode: on / off (and reason if off)
- tests: green
- review: lint OK / security OK / light check: 0 high, M med
- touches drift: X items had drift (see archive)
- archive path: `.jwforge/archive/…`

## Invariants

- ② and ③ MUST happen in different agent sessions. `tdd-item-runner` enforces this; do not bypass it.
- Never create commits on the user's branches. Worktrees are detached HEAD; their changes return to the main tree as unstaged edits via `git apply`. The `.git/worktrees/` metadata directory is internal git state and does not count as a commit.
- Never modify analysis files directly here — only via the project-analyzer agent in Step 5.
- On hard failure (e.g. test framework doesn't run, Agent tool errors), STOP and surface the error with the relevant `work-log` entry. Do not advance to later waves with broken state.
- If `parallel_safe = true` but a single wave has only one item, run it serially (no worktree overhead). Worktrees only earn their cost when a wave has ≥2 items.
