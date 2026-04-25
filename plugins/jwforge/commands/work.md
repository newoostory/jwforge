---
description: Run parallel TDD (4 agents, 5 stages) across the approved plan, non-stop. Followed by lightweight review.
---

You are running the **work** step of the jwforge flow. Execute every item in `.jwforge/current/plan.md` through the TDD pipeline without stopping for user input between items. Only interrupt for hard blockers.

## Step 0 — Preconditions

1. Read `.jwforge/current/plan.md`. If missing → tell user to run `/jwplan` and stop.
2. Read `.jwforge/project-analysis.md` if present (needed later for lint tools in review). If missing, note "no analysis — lint step will be skipped."
3. Parse items in order. For each, track status locally: `pending / spec_done / red_done / green_done / refactor_done / verified`.

## Step 1 — TDD pipeline per item

For each item (process sequentially, but see §2 for pipelining):

### ① Spec — `tdd-spec-opus`

Spawn subagent with:
> Item: <full item block from plan.md>. Produce a YAML list of test cases (normal, boundary, failure). Do NOT write any code. Return YAML under a `cases:` key.

Save the returned YAML to `.jwforge/current/work-log/NN-<id>/spec.yaml`.

### ② Red — `tdd-test-sonnet`

Spawn subagent with:
> Item spec YAML: <spec.yaml contents>. Acceptance: <from plan>. Write failing tests in the project's test framework. DO NOT modify production code. Run the tests and confirm they fail for the right reason. Return: paths of test files you wrote/modified + raw test output.

Save output to `.jwforge/current/work-log/NN-<id>/red.md`.

### ③ Green — `tdd-impl-sonnet`

Spawn subagent with:
> Tests that must pass: <list from red.md>. DO NOT modify any test file. Write the minimum implementation required to make the listed tests pass. Run the tests and confirm green. Return: paths of production files changed + test output.

Save to `green.md`. Fail fast if it reports red.

### ④ Refactor — `tdd-refactor-opus`

Spawn subagent with:
> Current state: green on <test paths>. Refactor production code only — DO NOT touch tests or spec. Keep tests green. Report diff summary (files, intent of each change). If nothing to refactor, say so.

Save to `refactor.md`.

### ⑤ Verify — `tdd-spec-opus` (reuse spec agent)

Spawn same `tdd-spec-opus` subagent again with:
> Original spec: <spec.yaml>. Tests written: <red.md>. Production code now at green. Independently verify the spec is fully covered by the tests, and scan for missing edge cases. If gaps exist, emit `RETRY_RED` with a supplemental spec. Otherwise emit `OK`.

Save to `verify.md`.

**If `RETRY_RED`**: run ② and ③ once more with the supplemental spec appended, then re-run ⑤. Do NOT retry a second time — if ⑤ still complains, record the gap in the log and move on.

## Step 2 — Pipelining

Within a single item, ①→②→③→④→⑤ are strictly sequential (each needs the previous stage's output) — spawn those in the **foreground**.

Use `Agent(..., run_in_background: true)` only for **cross-item** pipelining: while the current item is in ④ (Refactor), kick off the **next item's ①** (Spec) in the background, since they touch disjoint work. When the current item reaches ⑤, await the background ① so the next item can proceed to ②.

Do NOT parallelize ②/③/⑤ across items — those share file-system state and we want clean logs.

Print a short status line per stage completion (e.g. `[03 · add-task-cli] ③ green ✓`). Do NOT dump full subagent output to the user.

## Step 3 — Light review (after the last item's ⑤)

Run in order:

1. **security-review skill**: invoke via the Skill tool. Capture its output.
2. **Lint/type-check**: read `Lint Tools` section from `project-analysis.md`. Run every command listed. Capture pass/fail and first 50 lines of output per tool. Skip if the file is absent.
3. **Light check subagent**: spawn a fresh Haiku (or Opus if Haiku unavailable) with:
   > Scan the files modified during this /work cycle (list: …) for: hardcoded secrets/tokens, dead imports not caught by linter, obvious performance traps (DB call in loop, N+1). Keep output under 30 lines, flag severity (low/med/high).

Write the combined result to `.jwforge/current/work-log/_review.md`. If any **high** severity issue exists, print a short banner to the user before archiving.

## Step 4 — Incremental analysis update

If `.jwforge/project-analysis.md` exists:

Spawn **project-analyzer** in **incremental mode** with:
> Update `.jwforge/project-analysis.md` in place. Inputs: list of files created/modified/deleted during this /work cycle = <list>. Current meta: <.analysis-meta.json contents>. Patch only the sections affected by these changes (Stack, Structure, Entry Points, Test Framework, Lint Tools) — do NOT rewrite untouched sections. Update `.analysis-meta.json` with new tree hash and timestamp. Respect the agent's incremental-mode contract.

## Step 5 — Archive

1. Generate `<slug>` from the plan's title or first item id.
2. Create `.jwforge/archive/<YYYY-MM-DD_HHMM>_<slug>/`.
3. Move (not copy) `.jwforge/current/brainstorm.md`, `.jwforge/current/plan.md`, `.jwforge/current/work-log/` into the archive dir.
4. Leave `.jwforge/current/` empty but present.
5. Do NOT move `project-analysis.md` or `.analysis-meta.json`.

## Step 6 — Final summary to user

Print a compact summary:
- items completed: N
- tests passing: Y / Y
- review: lint OK / security OK / light check: 0 high, 2 med
- archive path: `.jwforge/archive/…`

## Invariants

- ② and ③ MUST use different subagent calls (different sessions). Never reuse the same `Agent` tool call to do both.
- Never modify the user's source control state (no git commits unless the user asks).
- On hard failure (e.g. test framework doesn't run, Agent tool errors), STOP and surface the error with the last `work-log` entry.
