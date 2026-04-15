# Compact Snapshot: {{task_title}}

<!-- Written by lifecycle.mjs PreCompact hook. Read by Conductor after context compaction. -->
<!-- state.json is authoritative. This snapshot provides human-readable resume context. -->

## Pipeline State
- pipeline: {{forge | fix}}
- task: {{task_title}}
- phase: {{1 | 2 | 3 | 4}}
- step: {{step_id}}  <!-- e.g. 3-2 -->
- complexity: {{S | M | L | XL}}
- status: in_progress

## Progress
- completed_levels: [{{level_numbers}}]  <!-- e.g. [0, 1] -->
- current_level: {{N}}
- fix_loop_count: {{N}}  <!-- 0 if not in fix loop -->
- tasks_done: [{{task_ids}}]  <!-- e.g. [Task-1, Task-2, Task-3] -->
- tasks_pending: [{{task_ids}}]

## Available Artifacts
<!-- Files that exist and are ready to read. -->
- {{artifact_path}}: {{one-line description}}

<!-- Example:
- .jwforge/current/state.json: authoritative pipeline state
- .jwforge/current/task-spec.md: requirements specification
- .jwforge/current/architecture.md: design + task list
-->

## Resume Instructions
<!-- Follow these steps to restore orchestration context after compaction. -->

1. Read `.jwforge/current/state.json` — confirm phase, step, and status.
2. Read `.jwforge/current/task-spec.md` — restore task understanding.
3. Read `.jwforge/current/architecture.md` — restore task list and contracts.
4. Resume at phase **{{phase}}**, step **{{step_id}}**.
5. {{resume_note}}

<!-- resume_note: one-sentence description of exactly where to pick up. -->
<!-- Example: "Level 1 executors all reported done; proceed to git commit then Phase 4." -->
