# Architecture: {{task_title}}

## Overview
<!-- 2-4 lines: module relationships, data flow, key design decisions. -->
- {{module_relationships}}
- {{data_flow}}
- {{key_design_decision}}

## Design Decisions
<!-- Non-obvious decisions with rationale. Each decision answers a question from task-spec.md assumptions. -->

### {{decision_topic}}
{{decision_description}}

## Interface Contracts
<!-- Every export consumed across units needs an entry here. Eliminates ambiguity between parallel Executors. -->

### {{contract_name}} ({{source_file}} → {{consumer_file}})
- signature: `{{function or type signature}}`
- params: {{parameter descriptions}}
- returns: {{return type and meaning}}
- error: {{error signaling method}}

## Units

<!-- level 0 units run in parallel. level 1+ wait for depends_on. -->
<!-- model: opus for complex/ambiguous, sonnet for routine. -->
<!-- test_files + impl_files: REQUIRED for TDD enforcement by tdd-guard hook. -->

### Unit-1: {{feature_name}}
- level: {{0 | 1 | 2 | ...}}
- type: {{create | modify}}
- model: {{sonnet | opus}}
- test_files: [{{test file paths relative to project root}}]
- impl_files: [{{implementation file paths relative to project root}}]
- input: {{source data, upstream outputs}}
- output: {{concrete deliverables}}
- context: {{design rationale, edge cases}}
- constraints: {{rules to follow}}

### Unit-2: {{feature_name}}
- level: {{0 | 1 | 2 | ...}}
- type: {{create | modify}}
- model: {{sonnet | opus}}
- test_files: [{{test file paths}}]
- impl_files: [{{implementation file paths}}]
- input: {{what this unit receives}}
- output: {{what this unit produces}}
- context: {{essential info for executor}}
- constraints: {{rules to follow}}
- depends_on: [Unit-1]

## Requirements Traceability
<!-- Map each R-requirement from task-spec.md to the unit(s) that implement it. -->

| Requirement | Unit(s) | How Covered |
|-------------|---------|-------------|
| R1: {{name}} | Unit-{{N}} | {{description}} |
