# Architecture: {{task_title}}

## Overview
<!-- 2-4 lines: module relationships, data flow, key design decisions. -->
- {{module relationship summary}}
- {{data flow description}}
- {{key design decision or trade-off}}

## Interface Contracts
<!-- Every export consumed across tasks needs an entry here. Eliminates ambiguity between parallel Executors. -->

### {{export-name}} ({{source-file}} -> {{consumer-file}})
- signature: `{{function or type signature}}`
- params: {{parameter names, types, and descriptions}}
- returns: {{return type and semantic meaning}}
- error: {{how errors are signaled: throws, returns null, error codes}}

<!-- EXAMPLE:
### parseConfig (src/config/parser.ts -> src/pipeline/runner.ts)
- signature: `export function parseConfig(raw: string): PipelineConfig`
- params: `raw` — YAML string from user config file
- returns: `PipelineConfig` with validated fields; optional fields filled with defaults
- error: throws `ConfigError` with human-readable message on validation failure

## Task List

### Task-1: Implement config parser
- level: 0
- type: create
- model: sonnet
- files: [src/config/parser.ts, src/config/types.ts]
- input: Raw YAML config schema from docs/config-spec.md
- output: parseConfig() and PipelineConfig type exported from src/config/parser.ts
- context: Validates all fields per docs/config-spec.md. PipelineConfig consumed by Task-2.
- constraints: No runtime deps beyond js-yaml. Export PipelineConfig type for Task-2.

### Task-2: Build pipeline runner
- level: 1
- type: create
- model: sonnet
- files: [src/pipeline/runner.ts]
- input: PipelineConfig from Task-1's parseConfig()
- output: runPipeline() that executes steps sequentially
- context: Import parseConfig and PipelineConfig from src/config/parser.ts per Interface Contract.
- constraints: Handle ConfigError from parseConfig gracefully. No direct file I/O.
- depends_on: [Task-1]
END EXAMPLE -->

## Task List
<!-- level 0 tasks run in parallel immediately. level 1+ tasks wait for depends_on. -->
<!-- model: opus for complex/ambiguous, sonnet for routine implementation. -->

### Task-1: {{feature_name}}
- level: {{0 | 1 | 2}}
- type: {{create | modify | extend}}
- model: {{sonnet | opus}}
- files: [{{exhaustive list of files this task reads or writes}}]
- input: {{source data, upstream outputs, references}}
- output: {{concrete deliverables: functions, types, files}}
- context: {{design rationale, edge cases, related code the Executor needs}}
- constraints: {{style rules, forbidden patterns, performance requirements}}

### Task-2: {{feature_name}}
- level: {{0 | 1 | 2}}
- type: {{create | modify | extend}}
- model: {{sonnet | opus}}
- files: [{{file list}}]
- input: {{what this task receives}}
- output: {{what this task produces}}
- context: {{essential info for Executor}}
- constraints: {{rules to follow}}
- depends_on: [Task-1]
- context_passing: {{what Conductor passes inline vs what Executor reads itself}}
