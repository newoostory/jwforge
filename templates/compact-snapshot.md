# Compact Snapshot: {{task_title}}

<!-- Written by pre-compact.mjs hook. Read by Conductor after context compaction. -->
<!-- state.json is authoritative. This snapshot provides human-readable resume context. -->

## Pipeline State
- pipeline: forge
- task: {{task_title}}
- phase: {{1 | 2 | 3 | 4}}
- step: {{step_id}}
- complexity: {{S | M | L | XL}}
- status: in_progress
- team_mode: {{teams | subagent_only}}

## Progress
- current_unit: {{N}}
- total_units: {{N}}
- completed_units: [{{unit_numbers}}]
- current_unit_test_written: {{true | false}}
- fix_loop_count: {{N}}

## Available Artifacts
<!-- Files that exist and are ready to read. -->
- {{artifact_path}}: {{one-line description}}

<!-- Example:
- .jwforge/current/state.json: authoritative pipeline state
- .jwforge/current/task-spec.md: requirements specification
- .jwforge/current/architecture.md: design + unit list
- .jwforge/current/tdd-state.json: TDD test completion tracking
-->

## Resume Instructions
1. Read `.jwforge/current/state.json` — confirm phase, step, and status.
2. Read `.jwforge/current/task-spec.md` — restore task understanding.
3. Read `.jwforge/current/architecture.md` — restore unit list and contracts.
4. Resume at phase **{{phase}}**, step **{{step_id}}**.
5. {{resume_note}}

<!-- resume_note: one-sentence description of exactly where to pick up. -->
