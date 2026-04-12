# Architecture: {{task_title}}

## Overview
<!-- Provide a concise summary of the system being built or modified. -->
<!-- Include module relationships and data flow in 2-4 lines. -->
- {{module relationship summary}}
- {{data flow one-line description}}
- {{key design decisions or trade-offs, if any}}

## Interface Contracts
<!-- Every Task that produces exports consumed by another Task MUST have a contract entry here. -->
<!-- Contracts eliminate ambiguity between Executors working in parallel on different tasks. -->
<!-- If a task has no cross-task dependencies, this section may be empty but must still be present. -->

### {{export-name}} ({{source-file}} -> {{consumer-file}})
<!-- One subsection per exported function, type, or data structure shared across tasks. -->
- signature: {{function or type signature, e.g. `function buildIndex(entries: Entry[]): Index`}}
- params: {{parameter names, types, and brief descriptions}}
- returns: {{return type and what it represents semantically}}
- error: {{how errors are signaled — throws, returns null, error codes, etc.}}

<!-- EXAMPLE START -->
<!--
## Interface Contracts

### parseConfig (src/config/parser.ts -> src/pipeline/runner.ts)
- signature: `export function parseConfig(raw: string): PipelineConfig`
- params: `raw` — YAML string from the user's config file
- returns: `PipelineConfig` object with validated fields; all optional fields filled with defaults
- error: throws `ConfigError` with a human-readable message if validation fails

## Task List

### Task-1: Implement config parser
- level: 0
- type: create
- model: sonnet
- files: [src/config/parser.ts, src/config/types.ts]
- input: Raw YAML config schema defined in docs/config-spec.md
- output: parseConfig() function and PipelineConfig type exported from src/config/parser.ts
- context: Must validate all fields per docs/config-spec.md. PipelineConfig is consumed by Task-2.
- constraints: No runtime dependencies beyond js-yaml. Must export PipelineConfig type for Task-2.

### Task-2: Build pipeline runner
- level: 1
- type: create
- model: sonnet
- files: [src/pipeline/runner.ts]
- input: PipelineConfig from Task-1's parseConfig()
- output: runPipeline() function that executes steps sequentially
- context: Import parseConfig and PipelineConfig from src/config/parser.ts per Interface Contract above.
- constraints: Must handle ConfigError from parseConfig gracefully. No direct file I/O — receive config string as argument.
- depends_on: [Task-1]
-->
<!-- EXAMPLE END -->

## Task List
<!-- List every task the Executor agents will carry out. -->
<!-- level 0 tasks run in parallel; level 1+ tasks wait for their depends_on to finish. -->
<!-- Choose model based on task complexity: opus for design-heavy or ambiguous work, sonnet for straightforward implementation. -->

### Task-1: {{feature_name}}
- level: {{0 | 1 | 2 | ...}}  <!-- 0 = no dependencies, can run immediately -->
- type: {{create | modify | extend}}  <!-- create = new file, modify = change existing, extend = add to existing -->
- model: {{sonnet | opus}}  <!-- opus for complex/ambiguous tasks, sonnet for routine implementation -->
- files: [{{related file list}}]  <!-- exhaustive list of files this task may read or write -->
- input: {{what this task receives}}  <!-- source data, upstream outputs, or references -->
- output: {{what this task produces}}  <!-- concrete deliverables: functions, types, files -->
- context: {{essential info Executor needs to know}}  <!-- design rationale, edge cases, related code -->
- constraints: {{rules to follow}}  <!-- style rules, forbidden patterns, performance requirements -->

### Task-2: {{feature_name}}
- level: {{0 | 1 | 2 | ...}}
- type: {{create | modify | extend}}
- model: {{sonnet | opus}}
- files: [{{related file list}}]
- input: {{what this task receives}}
- output: {{what this task produces}}
- context: {{essential info Executor needs to know}}
- constraints: {{rules to follow}}
- depends_on: [Task-1]  <!-- only for level 1+; list all tasks that must complete first -->
- context_passing: {{what goes in the Executor's prompt vs what it reads itself}}
<!-- Context Passing Strategy per task. Examples:
  - context_passing: "Pass file paths + summary inline. Executor reads files via Read/Grep."
  - context_passing: "Include full interface contract inline (small). Executor reads implementation files."
  This helps the Conductor know how to build each Executor's spawn prompt efficiently. -->
