---
name: cancel
description: "Cancel active JWForge pipeline, clean up teams and state"
user-invocable: true
---

# JWForge Cancel

Stop the active JWForge pipeline and clean up all resources.

## When Invoked

1. **Check for active pipeline**: Read `.jwforge/current/state.json`
2. **If no pipeline active**: Report "No active JWForge pipeline."
3. **If pipeline active**:

### Cleanup Steps

```
1. Read state.json to get current phase and team_name
2. If team exists (team_name is set):
   a. Send shutdown_request to all teammates via SendMessage
   b. Wait briefly for responses
   c. Call TeamDelete to remove the team
3. Update state.json: status = "stopped", stopped_at = now
4. Delete pipeline lock file: .jwforge/current/pipeline-required.json (if exists)
5. Report summary to user:
   - Task name
   - Phase where stopped
   - Files modified so far
   - Last good git commit (if any)
```

### Force Mode

If user says `/cancel --force` or `/cancel --all`:
- Delete `.jwforge/current/` entirely
- Remove any leftover team directories
- Report: "All JWForge state cleared."

## Messages

| Situation | Message |
|-----------|---------|
| Pipeline stopped | "JWForge pipeline stopped at Phase {N} ({name}). State preserved for resume with `/deep`." |
| No pipeline | "No active JWForge pipeline found." |
| Force clear | "All JWForge state cleared. Ready for fresh start." |

## Notes

- State is preserved by default (user can resume with `/deep`)
- Force mode deletes everything (no resume possible)
- Always clean up teams to avoid orphaned teammates
