# Forge Pipeline

Multi-agent orchestration pipeline for Claude Code.

## Triggers
- `/forge` — Full pipeline: Discover -> Design -> Build -> Validate
- `/fix` — Fix mode: Phase 4 (Validate) only

## Instructions
1. Read the full pipeline skill file: `Read("~/.claude/jwforge/skills/forge.md")`
2. Follow ALL instructions exactly.
3. Read configuration: `Read("~/.claude/jwforge/config/pipeline.json")`
