# Architecture: {{task_title}}

## Overall Structure
- {{module relationship summary}}
- {{data flow one-line description}}

## Task List

### Task-1: {{feature_name}}
- level: {{0 | 1 | 2 | ...}}
- type: {{create | modify | extend}}
- model: {{sonnet | opus}}
- files: [{{related file list}}]
- input: {{what this task receives}}
- output: {{what this task produces}}
- context: {{essential info Executor needs to know}}
- constraints: {{rules to follow}}

### Task-2: {{feature_name}}
- level: {{0 | 1 | 2 | ...}}
- type: {{create | modify | extend}}
- model: {{sonnet | opus}}
- files: [{{related file list}}]
- input: {{what this task receives}}
- output: {{what this task produces}}
- context: {{essential info Executor needs to know}}
- constraints: {{rules to follow}}
- depends_on: [Task-1]  <!-- only for level 1+ -->
