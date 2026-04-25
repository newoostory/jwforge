---
description: Build a TDD-ready plan from brainstorm (+ optional analysis). Annotates each item with the files it will touch and assigns a wave number for parallelizable execution. Iterates with user until approved.
---

You are running the **plan** step of the jwforge flow. Your job is to produce `.jwforge/current/plan.md` that `/work` can execute. Do NOT write code or run TDD agents yet.

## Step 1 — Preconditions

1. Read `.jwforge/current/brainstorm.md`. If missing → tell the user to run `/jwbrain` first and stop.
2. Check for `.jwforge/.analysis-meta.json`:
   - Exists → read it. Always load `project-analysis.md`. Load `module-map.md` (you'll need it for `touches` prediction). Load `api-map.md` / `data-model.md` only if the brainstorm references that surface.
   - Missing + project looks existing (same detection rule as `/jwanalyze`) → ask the user with **AskUserQuestion**: "No project analysis found. Run `/jwanalyze` first (recommended), or proceed without it?"
   - Missing + new project → proceed silently. (The plan can still be made; just `touches` predictions will all be `confidence: low`.)
3. **Read most recent touches feedback** (calibration from prior cycles): if `.jwforge/archive/` has any subdirectory containing `work-log/_touches-feedback.md`, read the file from the most recently dated archive. Use it to inform your `touches` predictions — if a similar slice in a recent cycle had drift on a particular file, weight that file as a likely additional touch this time. This is informational; do not block on it.

## Step 2 — Draft the plan

Break the work into **thin vertical slices** that are each testable in isolation. Each slice is one row in the plan.

Each plan item must have:
- `id` — short kebab-case, unique (e.g. `add-task-cli`)
- `title` — one-line
- `intent` — why this slice exists (1 sentence)
- `acceptance_criteria` — bullet list, testable statements
- `deps` — array of item ids this blocks on (can be empty)
- `est_size` — `S` / `M` / `L`
- `touches` — array of project-relative file paths this slice will create or modify (best-effort prediction)
- `touches_confidence` — `high` | `low` (see below)
- `wave` — integer ≥ 1, assigned by the algorithm in Step 3

### How to predict `touches`

Use `module-map.md` as your map. For each acceptance criterion, ask:
- Which existing module owns this behavior? (Look at `Role` and `Public exports`.)
- Which file inside that module will host the change? (Look at the module's `Files` list.)
- Will this slice add a new file? If yes, name it explicitly (your best guess at the path, matching the module's naming convention).
- Are tests in a sibling test file? If yes, include the test file path.

Set `touches_confidence`:
- `high` — every path comes from `module-map.md` directly, or follows a clear naming convention you can point to.
- `low` — you're guessing because the module is new, the brainstorm is vague, or no analysis exists. Includes the case "this slice probably touches X but I'm not sure".

If you list `touches: []`, set `touches_confidence: low`. The wave algorithm will treat unknown-touch items conservatively.

## Step 3 — Compute waves

Algorithm — apply after the slice list is otherwise stable:

1. **Compute level (topological depth)** for each item:
   - `level(i) = 0` if `deps` is empty
   - else `level(i) = 1 + max(level(d) for d in deps)`

2. **Group items by level**. Sort within a level by `id` for determinism.

3. **Detect collisions within a level**:
   - For each pair of items A, B at the same level:
     - If `A.touches ∩ B.touches` is non-empty → collision.
     - If either has `touches_confidence: low` → treat as collision (conservative).
   - For each colliding pair, bump the later-sorted item to the next level.
   - Repeat until no collisions remain at any level.

4. **Set `wave = level + 1`** (waves are 1-indexed for readability).

5. Items at the same `wave` are independent: same dep depth, no predicted file overlap, both confident. `/work` may execute them in parallel (subject to its own pre-flight checks).

Record the wave plan as a header for the user — see Step 4 layout.

## Step 4 — Present and iterate

Show the draft to the user in a single message using this layout:

```markdown
# Plan (draft <N>)

_Items: <count> · Waves: <count>_

## Wave overview
- Wave 1: <id>, <id>, …
- Wave 2: <id>, …
- …

## 01 · <id> — <title>
- Intent: …
- Acceptance:
  - [ ] …
- Deps: [<ids>]
- Size: S/M/L
- Touches: [<paths>]
- Touches confidence: high | low
- Wave: <N>

## 02 · …
```

After each draft, ask the user for feedback in plain text (not AskUserQuestion). **Loop**: incorporate edits and re-present until the user explicitly approves with "ok", "approve", "승인", or similar.

If the user adjusts deps, intents, or splits/merges items → re-run Step 3 before re-presenting. Wave assignment should always reflect the latest state.

## Step 5 — Commit to disk

On approval:
1. Write the final plan to `.jwforge/current/plan.md` using the exact layout from Step 4, plus a header:
   ```markdown
   # Plan

   _Approved: <YYYY-MM-DD HH:MM>_
   _Items: <count> · Waves: <count>_

   ## Wave overview
   - Wave 1: …
   - …
   ```
2. Print: "Plan saved. Next: `/work`."

## Invariants

- Do NOT invoke any TDD agents during `/jwplan`.
- Do NOT modify `brainstorm.md` or any analysis file.
- Each plan item must be independently testable, otherwise split it.
- `touches` is best-effort. `/work` will compare against actual modified files after each slice and append corrections to a feedback file the next planner run can read — do not over-engineer this here.
- Wave assignment is computed, not user-edited. If the user wants two items in the same wave, they should adjust `deps` or `touches` (or split a slice), and you re-run the algorithm.
