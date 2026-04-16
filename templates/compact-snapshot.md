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
6. **State-recorder protocol**: ALL state.json writes MUST go through state-recorder (haiku). NEVER write state.json directly.
7. **Artifact ownership**: Agent artifacts (task-spec.md, architecture.md, analysis-*.md, interview-log.md) may ONLY be written by their designated agents. NEVER write them yourself.
8. **User gates**: Phase 2->3 and Phase 3->4 transitions require user approval. Set waiting_for_user = true via state-recorder before presenting to user.
9. **No code before design**: Phase 1-2 are design-only. Do NOT write project source files until Phase 3.

<!-- resume_note: one-sentence description of exactly where to pick up. -->
