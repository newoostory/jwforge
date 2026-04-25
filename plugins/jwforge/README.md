# jwforge

Personal Claude Code plugin for a brainstorm → analyze → plan → parallel-TDD → review flow.

Four AI agents split the TDD pipeline to keep quality (Opus designs the spec and reviews coverage) and speed (Sonnet writes tests and the minimum implementation) at the same time.

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
/jwanalyze  →  .jwforge/project-analysis.md     (existing projects only, persistent)
/jwplan     →  .jwforge/current/plan.md         (iterates with you until approved)
/work       →  runs TDD across every plan item, then reviews, then archives
/jwreview   →  re-run review only (after manual edits, etc.)
```

`.jwforge/` lives in each project's cwd — not inside this plugin repo.

---

## TDD pipeline (per plan item)

| # | Stage | Agent | Model | What they do |
|---|---|---|---|---|
| ① | Spec | `tdd-spec-opus` | Opus | List the test cases (normal / boundary / failure) as YAML |
| ② | Red | `tdd-test-sonnet` | Sonnet | Turn cases into failing tests. No production code. |
| ③ | Green | `tdd-impl-sonnet` | Sonnet | Minimum implementation to pass. No test changes. |
| ④ | Refactor | `tdd-refactor-opus` | Opus | Clean up production code. Tests stay green. |
| ⑤ | Verify | `tdd-spec-opus` | Opus | Reopen ①, audit coverage. `OK` or `RETRY_RED` (once). |

②≠③ are different sessions so the test-writer never implements their own tests.

Pipelining: the next item's ① runs in parallel with the current item's ④.

---

## Workspace layout (per project)

```
<project>/.jwforge/
├── current/
│   ├── brainstorm.md
│   ├── plan.md
│   └── work-log/
│       ├── 01-<slug>/{spec.yaml,red.md,green.md,refactor.md,verify.md}
│       └── _review.md
├── project-analysis.md      ← persistent, incrementally updated
├── .analysis-meta.json
└── archive/
    └── 2026-04-19_1530_<slug>/   ← /work moves current/ here when done
```

---

## Review step

After the last plan item:
1. `security-review` skill
2. Lint / type-check — whatever `project-analysis.md`'s `Lint Tools` section lists (auto-detected)
3. Light Haiku scan for secrets, dead imports, obvious perf traps

Result lands in `work-log/_review.md`. High-severity issues are shown before archive.

---

## Non-stop

`/work` doesn't ask for input between items. You see short status lines; the summary comes at the end.
