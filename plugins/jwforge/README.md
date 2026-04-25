# jwforge

Personal Claude Code plugin for a brainstorm → analyze → plan → wave-TDD → review flow.

Five AI agents split the TDD pipeline: Opus designs the spec and audits coverage, Sonnet writes tests / implementation / orchestrates per-item runs. The planner annotates each slice with the files it will touch and assigns a wave number, so independent slices can execute in parallel when the project allows it.

---

## Install

### Local (development)

```
/plugin marketplace add /home/newoostory/jwforge
/plugin install jwforge@jwforge
```

### From GitHub

```
/plugin marketplace add <your-github-user>/jwforge
/plugin install jwforge@jwforge
```

After install, the commands `/jwbrain /jwanalyze /jwplan /work /jwreview` become available.

---

## Workflow

```
/jwbrain    →  .jwforge/current/brainstorm.md
/jwanalyze  →  .jwforge/{project-analysis,module-map,api-map?,data-model?}.md   (existing projects only, persistent)
/jwplan     →  .jwforge/current/plan.md            (iterates with you until approved)
/work       →  runs TDD wave-by-wave, then reviews, then archives
/jwreview   →  re-run review only (after manual edits, etc.)
```

`.jwforge/` lives in each project's cwd — not inside this plugin repo.

---

## Analysis files

`/jwanalyze` produces a **split** set of files so consumers can load only what they need:

| File | Always? | What's in it |
|---|---|---|
| `project-analysis.md` | yes | Stack, conventions, lint, test framework — thin overview, always loaded |
| `module-map.md` | yes | Per-module: files, role, public exports, imports, imported-by, **state/side-effects** — loaded selectively |
| `api-map.md` | only if applicable | HTTP routes, RPC handlers, events, scheduled jobs, CLI surface |
| `data-model.md` | only if applicable | Entities, DB schema, migrations |
| `.analysis-meta.json` | yes | `files` index + `tree_hash` + timestamps |

`/work` updates these incrementally after each cycle (creates/deletes the optional files as the surface changes).

> The `state/side-effects` field in `module-map.md` is what `/jwplan` uses to decide whether modules can run in parallel. After your first `/jwanalyze` on a new project, glance at it — if a module is marked "stateless" but actually writes to a global cache or shared file, parallel execution can mis-trigger. Fix it manually or re-run `/jwanalyze --force`.

---

## Plan items

`/jwplan` annotates each slice with what it will touch and which wave it belongs to:

```markdown
## 03 · add-task-cli — Add `task add` CLI command
- Intent: …
- Acceptance:
  - [ ] …
- Deps: [task-store]
- Size: S
- Touches: [src/cli/tasks.py, src/cli/__init__.py, tests/cli/test_tasks.py]
- Touches confidence: high
- Wave: 2
```

Items at the same wave share dep depth, have no predicted file overlap, and both have high `touches_confidence` — `/work` may run them in parallel.

---

## TDD pipeline (per plan item, run by `tdd-item-runner`)

| # | Stage | Agent | Model | What they do |
|---|---|---|---|---|
| ① | Spec | `tdd-spec-opus` | Opus | List the test cases (normal / boundary / failure) as YAML |
| ② | Red | `tdd-test-sonnet` | Sonnet | Turn cases into failing tests. No production code. |
| ③ | Green | `tdd-impl-sonnet` | Sonnet | Minimum implementation to pass. No test changes. |
| ④ | Refactor | `tdd-refactor-opus` | Opus | Clean up production code. Tests stay green. |
| ⑤ | Verify | `tdd-spec-opus` | Opus | Reopen ①, audit coverage. `OK` or `RETRY_RED` (once). |

② ≠ ③ are different sessions so the test-writer never implements their own tests.

---

## Wave execution

`/work` runs items wave-by-wave:

- **Single-item wave** → runs in the main working tree, foreground.
- **Multi-item wave + pre-flight pass** → each item runs in its own `git worktree`, in parallel. Diffs `git apply --check`'d together, then applied if all clean. Worktrees cleaned up after.
- **Multi-item wave + pre-flight fail** → collapsed to serial in the main tree.

Pre-flight gate (checked once at the start of `/work`):
1. Working tree clean.
2. `.gitignore` does not list `node_modules` / `venv` / `target` / `vendor` etc. (parallel needs per-worktree dependency setup, which is expensive).
3. All plan items have `touches_confidence: high`.
4. At least one wave actually has multiple items.

If any of those fails, parallel is disabled — the plan still runs, just sequentially.

After each cycle, `/work` writes `_touches-feedback.md` recording where actual file changes drifted from predicted ones, so the next planner run can calibrate.

---

## Workspace layout (per project)

```
<project>/.jwforge/
├── current/
│   ├── brainstorm.md
│   ├── plan.md
│   └── work-log/
│       ├── 01-<id>/{spec.yaml,red.md,green.md,refactor.md,verify.md}
│       ├── 02-<id>/…
│       ├── _touches-feedback.md
│       └── _review.md
├── project-analysis.md     ← persistent, incrementally updated
├── module-map.md           ← persistent
├── api-map.md              ← persistent (if applicable)
├── data-model.md           ← persistent (if applicable)
├── .analysis-meta.json
├── worktrees/              ← transient, cleaned up after each wave
└── archive/
    └── 2026-04-19_1530_<slug>/   ← /work moves current/ here when done
```

---

## Review step

After the last wave:
1. `security-review` skill
2. Lint / type-check — whatever `project-analysis.md`'s `Lint Tools` section lists
3. Light Haiku scan for secrets, dead imports, obvious perf traps

Result lands in `work-log/_review.md`. High-severity issues are shown before archive.

---

## Non-stop

`/work` doesn't ask for input between items. You see short status lines per item; the summary comes at the end.

If an item or wave fails, `/work` stops with a clear pointer to the work-log dir. Fix and re-run — the plan stays in `current/` until the cycle archives cleanly.
