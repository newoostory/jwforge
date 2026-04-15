# Task Spec: {{task_title}}

## Classification
- pipeline: forge
- type: {{feature | refactor | bugfix | docs}}
- complexity: {{S | M | L | XL}}

<!-- S=single-file, M=multi-file, L=system-level, XL=architectural -->

## Problem Statement
{{problem_statement}}

<!-- One focused paragraph: what is broken or missing, and why it matters. -->

## Requirements

### Must (Required)
- R1: {{required_item_1}}
- R2: {{required_item_2}}

<!-- Each item must be independently verifiable. Use R-numbering for traceability. -->

### Nice-to-have (Optional)
- N1: {{optional_item_1}}

## Technical Context
- stack: {{language/framework}}
- source_root: {{absolute path to project root}}
- affected_files:
  - {{file_path}} — {{change description}}
- new_files:
  - {{file_path}} — {{purpose}}
- dependencies: {{required libraries or APIs}}

<!-- affected_files + new_files: the complete list of files that will be created or modified. -->

## Research Findings
{{research_findings}}

<!-- Key facts discovered during codebase analysis. Patterns found, constraints uncovered, relevant existing code. -->

## Codebase Patterns
- naming: {{naming conventions found}}
- style: {{code style patterns}}
- utilities: {{key utility functions/modules relevant to this task}}

<!-- Patterns that executors must follow for consistency. -->

## Interview Summary
- total_rounds: {{N}}
- key_decisions:
  - {{decision_1}}
  - {{decision_2}}
- reversals: {{any reversed decisions with context}}
- final_confidence: {{percentage}}%

<!-- Key decisions: non-obvious choices made during interview that future agents need to know. -->
<!-- Reversals: explicitly note any decisions that were reversed from earlier rounds. -->

## Interview Confidence

| Area | Confidence | Notes |
|------|-----------|-------|
| {{area}} | {{HIGH/MEDIUM/LOW}} | {{notes}} |

## Constraints
- {{constraint_1}}

<!-- Hard limits: do not violate these. Examples: no new deps, don't touch X files, preserve backward compat. -->

## Success Criteria
- [ ] SC1: {{criterion_1}}
- [ ] SC2: {{criterion_2}}

<!-- Each criterion must be independently testable or observable. Use SC-numbering. -->

## Assumptions
- A1: {{assumption_key}}: "{{value}}" — {{reason}}
- A2: {{assumption_key}}: "{{value}}" — {{reason}}

<!-- Safe defaults chosen when user did not specify. If any assumption is wrong, it surfaces before Phase 3. -->
