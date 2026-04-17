# JWForge — Pipeline Enforcement Rules

This project is a **multi-agent orchestration pipeline** for Claude Code.
When a JWForge pipeline is active, **ALL work MUST follow the pipeline phases**.

## Install

JWForge uses a **project-scoped install by default**: `./install.sh [target-path]` writes hooks to `<target>/.claude/settings.json` (defaults to CWD). Pass `--global` to opt into the legacy global install (`~/.claude/settings.json`). The global install path is no longer the default.

## Active Pipeline Detection

Before doing ANY work, check if `.jwforge/current/state.json` exists and has `"status": "in_progress"`.
If it does, you are inside an active pipeline and MUST obey the rules below.

**Pipeline Lock**: When `/forge` is invoked, a lock file `.jwforge/current/pipeline-required.json`
is created BEFORE you process the message. If this lock exists but `state.json` doesn't, ALL file
modifications are blocked. You MUST initialize state.json through the proper pipeline protocol first.

## Hard Rules (NEVER violate)

1. **NO CODE BEFORE DESIGN** — Phase 1 and Phase 2 are design-only. Do NOT write, edit, or create
   any project source files. The ONLY files you may write are pipeline artifacts: `.jwforge/**`.

2. **NO PHASE SKIPPING** — Strict order: Phase 1 -> Phase 2 -> Phase 3 -> Phase 4. S complexity may
   skip Phase 2 (only allowed skip). Each phase's output is a prerequisite for the next.

3. **NO UNAUTHORIZED FILE EDITS** — During Phase 3, ONLY edit files listed in `architecture.md`.
   Do NOT edit files outside the plan without updating the architecture first.

4. **GIT COMMIT PREFIX** — All commits during an active pipeline MUST use the `[forge]` prefix.
   No direct `git commit` without this prefix.

5. **NO BASH BYPASS** — `sed -i`, `echo > file`, `tee`, `cp`, `mv` to project files are subject to
   the same phase restrictions as Edit/Write. If Edit/Write would be blocked, Bash is too.

6. **STATE INTEGRITY** — Do NOT manually edit `state.json` to skip phases or mark them complete.
   Legal transitions: phase 1->2 (after task-spec.md), 2->3 (after architecture.md), 3->4 (after
   execution). Status: `in_progress` -> `done` or `in_progress` -> `stopped` only.

7. **STATE WRITER** — The state-recorder agent (haiku) is the ONLY entity that writes to `state.json`.
   The Conductor delegates all state mutations to the state-recorder. Subagents report to the Conductor.
   ALL `Agent()` calls during active pipelines MUST include `run_in_background: true`.

8. **USER WAIT FLAG** — When the pipeline needs user input, set `waiting_for_user = true` in
   state.json BEFORE presenting questions. Clear it (`false`) after receiving answers.

9. **TDD ENFORCEMENT** — Phase 3 requires test files before implementation files for each unit,
   enforced by `tdd-guard.mjs`. Test files must exist before implementation files can be written.

10. **KNOWLEDGE SYSTEM BLOCKED** — Knowledge base features (issue-patterns, review-additions, /retro)
    are blocked in v1. Do not create knowledge-writer, retro-analyzer, or retro-patcher agents.

## Pipeline Files

| File | Purpose | When Created |
|------|---------|-------------|
| `.jwforge/current/state.json` | Pipeline state | Phase 1 start |
| `.jwforge/current/task-spec.md` | Requirements spec | Phase 1 end |
| `.jwforge/current/architecture.md` | Design document | Phase 2 end |
| `.jwforge/current/interview-log.md` | Interview Q&A | Phase 1 |
| `.jwforge/current/analysis-*.md` | Codebase analysis | Phase 2 start |
| `.jwforge/current/review-*.md` | Review reports | Phase gates |
| `.jwforge/current/verify-report.md` | Verification results | Phase 4 |
| `.jwforge/current/test-report.md` | Integration tests | Phase 4 |
| `.jwforge/current/tdd-state.json` | TDD tracking | Phase 3 |
| `.jwforge/current/compact-snapshot.md` | Compaction backup | On compact |
| `.jwforge/current/agent-log.jsonl` | Agent tracking | Ongoing |
| `.jwforge/archive/{name}/` | Pipeline archive | Pipeline end |

## Enforcement

Rules are enforced by hooks in `hooks/`:
- `trigger.mjs` — `/forge` and `/fix` keyword detection + lock creation
- `phase-guard.mjs` — Unified Edit/Write/Bash phase enforcement
- `tdd-guard.mjs` — TDD test-before-impl enforcement (Phase 3)
- `state-validator.mjs` — State.json transition validation
- `artifact-validator.mjs` — Artifact prerequisite checks on phase advance
- `commit-guard.mjs` — Git commit prefix + dangerous operation blocking
- `persistent-mode.mjs` — Prevent premature session end
- `on-stop.mjs` — Archive + cleanup on session end
- `pre-compact.mjs` — Snapshot save before context compaction
- `notify.mjs` — Desktop notifications on state transitions
- `subagent-tracker.mjs` — Agent/team activity logging

Hooks use `decision: "block"` to HARD BLOCK unauthorized actions. You cannot override hooks.

## /fix Mode

`/fix` enters Phase 4 only — standalone error fixing without running the full pipeline.
