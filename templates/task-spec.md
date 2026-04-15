# Task Spec: {{task_title}}

## Classification
- pipeline: {{forge}}
- type: {{new-feature | bug-fix | refactor | config | docs}}
- complexity: {{S | M | L | XL}}

<!-- S=single-file, M=multi-file, L=system-level, XL=architectural -->

## Problem Statement
{{problem_statement}}

<!-- One focused paragraph: what is broken or missing, and why it matters. -->

## Requirements

### Must (Required)
- {{required_item_1}}
- {{required_item_2}}

<!-- Each item must be independently verifiable. Be specific, not vague. -->

### Nice-to-have (Optional)
- {{optional_item_1}}

## Technical Context
- stack: {{language/framework}}
- source_root: {{absolute path to project root}}
- affected_files:
  - {{file_path}} ({{change description}})
- dependencies: {{required libraries or APIs}}

<!-- affected_files: all files that will be created or modified. Executors scope their work to this list. -->

## Research Findings
{{research_findings}}

<!-- Key facts discovered during context collection. Patterns found, constraints uncovered, relevant existing code. -->

## Interview Summary
- total_rounds: {{N}}
- key_decisions:
  - {{decision_1}}
  - {{decision_2}}
- final_confidence: {{percentage}}%

<!-- Key decisions: non-obvious choices made during interview that future agents need to know. -->

## Constraints
- {{constraint_1}}

<!-- Hard limits: do not violate these. Examples: no new deps, don't touch X files, preserve backward compat. -->

## Success Criteria
- [ ] {{criterion_1}}
- [ ] {{criterion_2}}

<!-- Each criterion must be independently testable or observable. No vague "works correctly". -->

## Assumptions
- {{assumption_key}}: "{{value}}" — {{reason}}

<!-- Safe defaults chosen when user did not specify. If any assumption is wrong, it surfaces before Phase 3. -->
