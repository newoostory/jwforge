# JWForge — Pipeline Enforcement Rules

This project is a **multi-agent orchestration pipeline** for Claude Code.
When a JWForge pipeline is active, **ALL work MUST follow the pipeline phases**.

## Active Pipeline Detection

Before doing ANY work, check if `.jwforge/current/state.json` exists and has `"status": "in_progress"`.
If it does, you are inside an active pipeline and MUST obey the rules below.

**Pipeline Lock**: When `/deep`, `/deeptk`, or `/surface` is invoked, a lock file `.jwforge/current/pipeline-required.json` is created BEFORE you process the message. If this lock exists but `state.json` doesn't, ALL file modifications are blocked. You MUST initialize state.json through the proper pipeline protocol first. You cannot skip this step.

## Hard Rules (NEVER violate)

### 1. NO CODE BEFORE DESIGN
- Phase 1 (Deep Interview) and Phase 2 (Architecture) are **design-only phases**.
- Do NOT write, edit, or create any project source files during Phase 1 or Phase 2.
- The ONLY files you may write are pipeline artifacts: `.jwforge/**`, `state.json`, `task-spec.md`, `architecture.md`.

### 2. NO PHASE SKIPPING
- Phases execute in strict order: **Phase 1 → Phase 2 → Phase 3 → Phase 4**.
- You CANNOT jump from Phase 1 to Phase 3. You CANNOT skip Phase 4 (Verify).
- S complexity may skip Phase 2 — this is the ONLY allowed skip.
- Each phase's output is a prerequisite for the next:
  - Phase 1 produces `task-spec.md` → required for Phase 2
  - Phase 2 produces `architecture.md` → required for Phase 3
  - Phase 3 produces code → required for Phase 4

### 3. NO UNAUTHORIZED FILE EDITS
- During Phase 3 (Execute), ONLY edit files listed in `architecture.md`.
- Do NOT edit files outside the architecture plan without updating the architecture first.
- This applies to ALL methods of file modification: Edit tool, Write tool, Bash tool (sed, echo, tee, etc.).

### 4. GIT COMMIT CONVENTIONS
- During `/deep` pipeline: all commits MUST use `[jwforge]` prefix.
- During `/deeptk` pipeline: all commits MUST use `[jwforge-deeptk]` prefix.
- During `/surface` pipeline: all commits MUST use `[jwforge-surface]` prefix.
- No direct `git commit` without the proper prefix during active pipelines.

### 5. NO BASH BYPASS
- Do NOT use the Bash tool to circumvent Edit/Write guards.
- `sed -i`, `echo > file`, `cat << EOF > file`, `tee`, `cp`, `mv` to project files are ALL subject to the same phase restrictions as Edit/Write.
- If the Edit/Write tool would be blocked, the Bash equivalent is also forbidden.

### 6. STATE INTEGRITY
- Do NOT manually edit `state.json` to skip phases or mark them as complete.
- State transitions must follow the legal order:
  - `phase: 1` → `phase: 2` (only after `task-spec.md` exists)
  - `phase: 2` → `phase: 3` (only after `architecture.md` exists, or S complexity skip)
  - `phase: 3` → `phase: 4` (only after all executor levels complete)
- `status` can only go: `in_progress` → `done` or `in_progress` → `stopped`

## Pipeline Files

| File | Purpose | When Created |
|------|---------|-------------|
| `.jwforge/current/state.json` | Pipeline state | Phase 1 start |
| `.jwforge/current/task-spec.md` | Requirements spec | Phase 1 end |
| `.jwforge/current/architecture.md` | Design document | Phase 2 end |
| `.jwforge/current/agent-log.jsonl` | Agent tracking | Ongoing |
| `.jwforge/current/compact-snapshot.md` | Compaction backup | On context compact |
| `.jwforge/archive/{name}/` | Pipeline archive | Pipeline end |
| `.jwforge/knowledge/` | Learning DB | Ongoing |

### 7. AGENT SPAWN REQUIREMENTS
- ALL `Agent()` calls during active pipelines MUST include `run_in_background: true`.
- This prevents agents from opening in separate tmux panes.
- The Conductor is the ONLY entity that writes to `state.json`. Subagents report to the Conductor.

### 8. USER WAIT FLAG
- When the pipeline needs user input (e.g., interview answers), set `state.waiting_for_user = true` in state.json BEFORE presenting questions.
- After receiving user input, set `state.waiting_for_user = false`.
- The `persistent-mode.mjs` hook uses this flag to allow clean session ends during user waits.

## Pipeline Files

| File | Purpose | When Created |
|------|---------|-------------|
| `.jwforge/current/state.json` | Pipeline state | Phase 1 start |
| `.jwforge/current/task-spec.md` | Requirements spec | Phase 1 end |
| `.jwforge/current/architecture.md` | Design document | Phase 2 end |
| `.jwforge/current/agent-log.jsonl` | Agent tracking | Ongoing |
| `.jwforge/current/compact-snapshot.md` | Compaction backup | On context compact |
| `.jwforge/archive/{name}/` | Pipeline archive | Pipeline end |
| `.jwforge/knowledge/` | Learning DB | Ongoing |
| `config/phase-config.json` | Phase/step definitions | Static config |

## Enforcement

These rules are enforced by hooks in `hooks/`:
- `pre-tool-guard.mjs` — Blocks Edit/Write during wrong phases (5s timeout)
- `bash-guard.mjs` — Blocks Bash file writes during wrong phases (safe redirects whitelisted: /dev/null, /tmp/*, .git/*)
- `git-commit-guard.mjs` — Enforces commit prefix conventions
- `state-validator.mjs` — Validates state.json transitions, loads step definitions from `phase-config.json` (5s timeout)
- `artifact-validator.mjs` — Validates required artifacts on phase-advancing writes only (skips non-phase-advancing writes for performance, 5s timeout)
- `persistent-mode.mjs` — Prevents premature pipeline stops (uses `waiting_for_user` flag)
- `on-stop.mjs` — Archives pipeline on session end; preserves team dirs and pipeline lock when status was `in_progress`
- `pre-compact.mjs` — Preserves state during context compaction

Hooks use `decision: "block"` to HARD BLOCK unauthorized actions. You cannot override hooks.
