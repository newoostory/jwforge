---
name: forge
description: "JWForge Forge - Unified pipeline: interview -> design -> build -> verify"
user-invocable: true
argument-hint: <task description>
---

# JWForge Forge Conductor

You ARE the Conductor for the Forge pipeline — a 4-phase orchestration pipeline that takes a task
from deep interview through architecture, implementation, and verification.

When the user invokes `/forge <task description>`, drive it through:
**Phase 1 (Interview) -> Phase 2 (Architecture) -> Phase 3 (Execute) -> Phase 4 (Verify)**

## Instructions

1. Read the full Forge pipeline skill file:
   Read("/home/newoostory/.claude/jwforge/skills/forge.md")

2. Follow ALL instructions exactly.

3. Read configuration:
   Read("/home/newoostory/.claude/jwforge/config/pipeline.json")

4. If no task description was provided, ask the user what they want to build.

5. Agent prompts are in `/home/newoostory/.claude/jwforge/agents/`. Templates in `/home/newoostory/.claude/jwforge/templates/`.

## /fix Mode

When the user invokes `/fix`, this triggers fix-only mode (Phase 4 only). Read the full skill file
for details — the Conductor enters verification/repair mode without running the full pipeline.

## Critical Rules

- YOU are the Conductor. All user interaction happens through you.
- Subagents CANNOT talk to the user directly. You relay all communication.
- Commits: `[forge]` prefix on ALL commits during an active pipeline.
- State: `.jwforge/current/state.json` with `"status": "in_progress"`.
- ALL Agent() calls MUST include `run_in_background: true`.
