---
name: resume
description: "Resume or archive a JWForge pipeline from saved state. Handles deep and surface pipelines."
user-invocable: true
---

# JWForge Resume Logic

When `/resume` is invoked, execute the following decision tree exactly.

---

## Step 1: Check for State

Read `.jwforge/current/state.json`.

- If the file does **not** exist:
  Report to user: "No pipeline to resume. Use `/deep` or `/surface` to start one."
  Stop here.

---

## Step 2: Branch on Status

Read the `status` field from state.json.

---

### Branch A: status = "done"

The pipeline finished successfully. Auto-archive it.

1. Read state.json fields: `task`, `pipeline` (or absence of it for deep), `phase`, `step`, `complexity`, `type`.

2. Build archive folder name:
   - Format: `YYYYMMDD-HHmmss-{task-slug}`
   - task-slug: lowercase the task string, replace spaces/special chars with `-`, truncate to 40 chars
   - Example: `20260404-153012-add-resume-skill`

3. Archive using the Bash tool with the actual project root (current working directory):
   ```bash
   TIMESTAMP=$(date +%Y%m%d-%H%M%S)
   TASK_SLUG=$(echo "<task>" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/-\+/-/g' | cut -c1-40 | sed 's/-$//')
   mkdir -p .jwforge/archive/${TIMESTAMP}-${TASK_SLUG}
   mv .jwforge/current/* .jwforge/archive/${TIMESTAMP}-${TASK_SLUG}/
   ```
   Replace `<task>` with the actual task string from state.json.

4. Report:
   ```
   Pipeline completed. Archived to .jwforge/archive/{folder}/
   Task: {task}
   ```

---

### Branch B: status = "stopped" or "in_progress" or "error"

Resume the pipeline.

1. Read all available fields from state.json: `task`, `pipeline`, `phase`, `step`, `complexity`, `type`, `status`, `root_cause` (if present), `error` (if present).

2. Display summary to user:
   ```
   Resuming JWForge pipeline:
   - Task: {task}
   - Pipeline: {deep | surface}
   - Phase/Step: {phase or step}
   - Complexity: {complexity or "N/A"}
   - Type: {type or "N/A"}
   - Status: {status}
   [If status="error": - Error: {error message}]
   ```

3. Detect pipeline type:
   - If state.json has `"pipeline": "surface"` → **Surface pipeline** (go to Branch B-Surface)
   - Otherwise → **Deep pipeline** (go to Branch B-Deep)

---

#### Branch B-Deep: Resume Deep Pipeline

Read `skills/jwforge.md` for the full pipeline specification.

Resume based on `phase` and `step` in state.json:

| Current Phase | Condition | Resume Action |
|---------------|-----------|---------------|
| Phase 1 | `task-spec.md` exists | Skip to Phase 2 |
| Phase 1 | `task-spec.md` missing | Restart Phase 1 from step 1-1 |
| Phase 2 | `architecture.md` exists | Skip to Phase 3 |
| Phase 2 | `architecture.md` missing | Restart Phase 2 |
| Phase 3 | Check `completed_levels` in state | Resume from first incomplete level |
| Phase 4 | Any | Resume from verify/test stage |

**Team note:** The previous team is gone. When resuming Phase 2+:
- Call TeamCreate to create a new team.
- Add Architect teammate (read `agents/architect.md` for the prompt).
- Load context from existing files: `task-spec.md`, `architecture.md`, `state.json`.
- Reviewer is always a per-phase subagent — no need to add to team.

Update state.json `status` back to `"in_progress"` before proceeding.

Then continue executing the pipeline from the resume point, following all rules in `skills/jwforge.md`.

---

#### Branch B-Surface: Resume Surface Pipeline

Read `skills/surface.md` for the full surface pipeline specification.

Resume based on `step` in state.json:

| Current Step | Resume Action |
|--------------|---------------|
| `"investigate"` | Re-run investigation from scratch (root_cause likely null) |
| `"fix"` | Root cause known — proceed to Step 2 Fix |
| `"verify"` | Fix done — proceed to Step 3 Verify |

If `root_cause` is null and step is `"fix"` or `"verify"`, warn:
```
Warning: root_cause is empty but step is "{step}". Restarting investigation.
```
Then re-run investigation.

Update state.json `status` back to `"in_progress"` before proceeding.

Then continue executing the surface pipeline from the resume point, following all rules in `skills/surface.md`.

---

## Utility: Derive Pipeline Type

If `state.json` has:
- `"pipeline": "surface"` → surface
- `"pipeline": "deep"` → deep
- No `pipeline` field → deep (legacy state format)

---

## Archive Naming Reference

Existing archive folders use format: `YYYYMMDD-HHmmss-{slug}`
Examples from `.jwforge/archive/`:
- `20260404-204200-reviewer-refactor`
- `20260404-174229-reviewer-subagent-refactor`

Match this convention exactly.
