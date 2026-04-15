# JWForge — Pipeline Enforcement Rules

This project is a **multi-agent orchestration pipeline** for Claude Code.
When a JWForge pipeline is active, **ALL work MUST follow the pipeline phases**.

## Active Pipeline Detection

Before doing ANY work, check if `.jwforge/current/state.json` exists and has `"status": "in_progress"`.
If it does, you are inside an active pipeline and MUST obey the rules below.

**Pipeline Lock**: When `/forge` is invoked, a lock file `.jwforge/current/pipeline-required.json`
is created BEFORE you process the message. If this lock exists but `state.json` doesn't, ALL file
modifications are blocked. You MUST initialize state.json through the proper pipeline protocol first.

## Hard Rules (NEVER violate)

1. **NO CODE BEFORE DESIGN** — Phase 1 and Phase 2 are design-only. Do NOT write, edit, or create
   any project source files. The ONLY files you may write are pipeline artifacts: `.jwforge/**`.

2. **NO PHASE SKIPPING** — Strict order: Phase 1 → Phase 2 → Phase 3 → Phase 4. S complexity may
   skip Phase 2 (only allowed skip). Each phase's output is a prerequisite for the next.

3. **NO UNAUTHORIZED FILE EDITS** — During Phase 3, ONLY edit files listed in `architecture.md`.
   Do NOT edit files outside the plan without updating the architecture first.

4. **GIT COMMIT PREFIX** — All commits during an active pipeline MUST use the `[forge]` prefix.
   No direct `git commit` without this prefix.

5. **NO BASH BYPASS** — `sed -i`, `echo > file`, `tee`, `cp`, `mv` to project files are subject to
   the same phase restrictions as Edit/Write. If Edit/Write would be blocked, Bash is too.

6. **STATE INTEGRITY** — Do NOT manually edit `state.json` to skip phases or mark them complete.
   Legal transitions: phase 1→2 (after task-spec.md), 2→3 (after architecture.md), 3→4 (after
   execution). Status: `in_progress` → `done` or `in_progress` → `stopped` only.

7. **AGENT SPAWN** — ALL `Agent()` calls during active pipelines MUST include `run_in_background: true`.
   The Conductor is the ONLY entity that writes to `state.json`. Subagents report to the Conductor.

8. **USER WAIT FLAG** — When the pipeline needs user input, set `waiting_for_user = true` in
   state.json BEFORE presenting questions. Clear it (`false`) after receiving answers.

## Pipeline Files

| File | Purpose | When Created |
|------|---------|-------------|
| `.jwforge/current/state.json` | Pipeline state | Phase 1 start |
| `.jwforge/current/task-spec.md` | Requirements spec | Phase 1 end |
| `.jwforge/current/architecture.md` | Design document | Phase 2 end |
| `.jwforge/current/compact-snapshot.md` | Compaction backup | On compact |
| `.jwforge/current/agent-log.jsonl` | Agent tracking | Ongoing |
| `.jwforge/archive/{name}/` | Pipeline archive | Pipeline end |

## Enforcement

Rules are enforced by hooks in `hooks/`:
- `phase-guard.mjs` — Unified Edit/Write/Bash phase enforcement
- `state-validator.mjs` — State.json transition validation
- `commit-guard.mjs` — Git commit prefix + dangerous operation blocking
- `trigger.mjs` — `/forge` and `/fix` keyword detection + lock creation
- `lifecycle.mjs` — PreCompact snapshot + Stop archive/cleanup

Hooks use `decision: "block"` to HARD BLOCK unauthorized actions. You cannot override hooks.

## /fix Mode

`/fix` enters Phase 4 only — standalone error fixing without running the full pipeline.
