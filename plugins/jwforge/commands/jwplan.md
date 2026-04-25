---
description: Build a TDD-ready plan from brainstorm (+ optional analysis). Iterates with user until approved.
---

You are running the **plan** step of the jwforge flow. Your job is to produce `.jwforge/current/plan.md` that `/work` can execute. Do NOT write code or run TDD agents yet.

## Step 1 — Preconditions

1. Read `.jwforge/current/brainstorm.md`. If missing → tell the user to run `/jwbrain` first and stop.
2. Check for `.jwforge/project-analysis.md`:
   - Exists → load it. Use it when shaping the plan (reuse existing modules, match conventions, use the detected test framework).
   - Missing + project looks existing (same detection rule as `/jwanalyze`) → ask the user with **AskUserQuestion**: "No project analysis found. Run `/jwanalyze` first (recommended), or proceed without it?"
   - Missing + new project → proceed silently.

## Step 2 — Draft the plan

Break the work into **thin vertical slices** that are each testable in isolation. Each slice is one row in the plan.

Each plan item must have:
- `id` — short kebab-case, unique (e.g. `add-task-cli`)
- `title` — one-line
- `intent` — why this slice exists (1 sentence)
- `acceptance_criteria` — bullet list, testable statements
- `deps` — array of item ids this blocks on (can be empty)
- `est_size` — `S` / `M` / `L`

Order items by topological sort on `deps`. Keep slices small — if a slice has >5 acceptance criteria, split it.

## Step 3 — Present and iterate

Show the draft to the user in a single message using this layout:

```markdown
# Plan (draft <N>)

## 01 · <id> — <title>
- Intent: ...
- Acceptance:
  - [ ] ...
- Deps: [<ids>]
- Size: S/M/L

## 02 · ...
```

After each draft, ask the user for feedback in plain text (not AskUserQuestion — free-form is better here). **Loop**: incorporate edits and re-present until the user explicitly approves with "ok", "approve", "승인", or similar affirmation.

## Step 4 — Commit to disk

On approval:
1. Write the final plan to `.jwforge/current/plan.md` with the exact layout above, plus a header:
   ```markdown
   # Plan

   _Approved: <YYYY-MM-DD HH:MM>_
   _Items: <count>_
   ```
2. Print: "Plan saved. Next: `/work`."

## Invariants

- Do NOT invoke any TDD agents during `/jwplan`.
- Do NOT modify `brainstorm.md` or `project-analysis.md`.
- Each plan item must be independently testable, otherwise split it.
