# Task Spec: {{task_title}}

<!-- Example: # Task Spec: Refactor Sync Engine to Support Recurring Tasks -->

## Classification
- pipeline: deeptk
- type: {{new-feature | bug-fix | refactor | config | docs}}
- complexity: {{M | L | XL}}

<!-- deeptk is for M/L/XL only. S-complexity tasks use /surface instead.
  Complexity guide:
    M = multi-file change, 1–2 days, moderate cross-cutting concerns
    L = system-level change, 3–5 days, significant interface design needed
    XL = architectural change, 1+ week, multiple sub-systems affected
-->

## Problem Statement
{{problem_statement}}

<!-- Example:
  The sync engine handles only non-recurring tasks. When a recurring task is
  due, the sync API silently returns stale data because recurring_tasks table
  is never queried. This causes data divergence between clients and is the
  root cause of 3 open bug reports. Fix requires changes to the sync query
  logic and the recurring task expansion algorithm.
-->

## Requirements

### Must (Required)
- {{required_item}}

<!-- Example Must items:
  - Sync API must query recurring_tasks table and expand due instances
  - Expanded instances must appear in /api/sync response within 200ms
  - Existing task sync logic must be unaffected (no regression)
  - Add integration test covering recurring task sync scenario
-->

### Nice-to-have (Optional)
- {{optional_item}}

<!-- Example Nice-to-have items:
  - Support partial sync (delta sync) for recurring task changes
  - Expose recurring_tasks count in /api/stats endpoint
-->

## Technical Context
- stack: {{language/framework}}
- source_root: {{absolute path to project root}}
- affected_files: {{list of affected existing files}}
- new_files: {{list of new files to create}}
- dependencies: {{required dependencies}}
- deploy_command: {{optional — command to deploy/install after changes}}

<!-- affected_files = existing files to MODIFY (with description of change).
  new_files = files that do not yet exist and will be CREATED.
  Keep both lists complete — Executors scope their work exclusively to these lists.
-->

## Research Findings

### Codebase Analysis
{{codebase_analysis}}

<!-- Example — show realistic observations from reading the actual code:
  - src/sync/query.ts: getSyncData() builds a single SQL query joining tasks + tags.
    recurring_tasks table is never referenced here — confirmed root cause.
  - src/recurring/expander.ts: expandRecurringTask(task, date) exists and is tested.
    Returns Task[] — compatible with sync response shape. Safe to reuse.
  - DB schema: recurring_tasks has (id, base_task_id, rule, last_expanded_at).
    base_task_id FK → tasks.id. Expansion inserts into tasks with recurring=true flag.
  - No existing integration tests for sync — only unit tests in src/sync/*.test.ts.
  - Magic value: 1500ms hardcoded in src/sync/poller.ts line 42 — flag for cleanup.
-->

### Technical Constraints
{{technical_constraints}}

<!-- Example — constraints discovered from reading the codebase (not user-stated):
  - getSyncData() returns a raw SQL result, not ORM objects — any join must stay in SQL
  - recurring_tasks expansion is idempotent but expensive: O(n rules × days ahead)
    Must gate expansion behind a freshness check (last_expanded_at < now - 1h)
  - DB connection pool size is 10 (config/db.ts) — avoid N+1 query patterns
  - Test suite uses in-memory SQLite for unit tests but real PG for integration tests
    New integration test must use the PG test fixture setup in tests/fixtures/db.ts
-->

### Risk Assessment
{{risk_assessment}}

<!-- Example — risks with severity rating:
  - HIGH: getSyncData() is called on every client reconnect — adding a JOIN without
    an index on recurring_tasks.base_task_id will cause full table scans under load.
    Mitigation: add index in migration before deploying.
  - MEDIUM: expandRecurringTask() has a known edge case for DST transitions (see
    TODO comment in expander.ts:88). Expansion around DST dates may produce duplicates.
    Mitigation: scope fix to non-DST dates; file separate issue for DST edge case.
  - LOW: Magic value 1500ms in poller.ts is out of scope but should be noted in
    architecture.md so Fixer doesn't mistake it for intentional behavior.
-->

## Interview Summary
- total_rounds: {{N}}
- key_decisions: {{list of important decisions made during interview}}
- final_confidence: {{percentage}}%

<!-- key_decisions should capture non-obvious scope/approach choices, e.g.:
  - Expansion-on-sync chosen over background job (simpler, no new infra)
  - Integration test required (not just unit) because root cause is SQL join
  - DST edge case deferred — separate issue filed, not blocking this task
-->

## Constraints
- {{constraint}}

<!-- Example constraints:
  - Do NOT change the /api/sync response shape (clients depend on it)
  - All DB changes must be in a versioned migration file (not inline SQL)
  - No new npm/pip dependencies without prior approval
  - source changes only to /home/user/project/ — not directly to deployed location
-->

## Success Criteria
- [ ] {{criterion}}

<!-- Example success criteria (each independently verifiable):
  - [ ] GET /api/sync includes recurring task instances due within next 7 days
  - [ ] Integration test in tests/integration/sync.test.ts passes with PG fixture
  - [ ] No regression on existing task sync (existing unit tests all pass)
  - [ ] DB migration adds index on recurring_tasks.base_task_id
  - [ ] getSyncData() query runs in < 200ms on 10k task dataset (load test)
-->

## Assumptions
- {{items where user did not confirm, filled with default values}}

<!-- Example assumptions:
  - expansion_window: "7 days ahead" — reasonable default; user did not specify lookahead
  - freshness_threshold: "1 hour" — balances staleness vs expansion cost
  - migration_strategy: "versioned migration file" — matches existing project convention
  If any assumption is wrong, it should surface in Phase 1 review before implementation.
-->
