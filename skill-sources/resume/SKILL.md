---
name: resume
description: "Resume or archive a JWForge pipeline (deep or surface) from saved state"
user-invocable: true
---

# JWForge Resume

Resume, archive, or report on a JWForge pipeline from saved state.

## When Invoked

1. Read the full resume logic file:
   ```
   Read("skills/resume.md")
   ```

2. Follow ALL instructions in that file exactly.

## Notes

- Works for both `/deep` (4-phase) and `/surface` (3-step) pipelines.
- Teams do not persist across sessions — do not attempt to reconnect them.
- Delegation to pipeline logic happens by reading the relevant skills file, not by invoking the skill afresh.
