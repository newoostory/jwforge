---
name: simplify
description: "Review changed code for dead code, duplication, over-abstraction, then clean up"
user-invocable: true
argument-hint: [optional file or directory scope]
---

# JWForge Simplify

Review recent changes and clean up AI-generated slop: dead code, unnecessary abstractions, duplication, and over-engineering.

Inspired by OMC's ai-slop-cleaner.

## Principles

- Write a cleanup plan BEFORE modifying code
- Prefer deletion over addition
- Reuse existing utilities before introducing new ones
- Keep diffs small and reversible
- Lock behavior with tests first when practical

## Steps

### 1. Identify Scope

If `$ARGUMENTS` provided, use that scope. Otherwise:
- Check `git diff --name-only HEAD~1` for recently changed files
- If in a pipeline, check `.jwforge/current/state.json` for files_modified

### 2. Analyze (Read-Only Pass)

Spawn a sonnet agent to review the scoped files for:

| Smell | Description |
|-------|-------------|
| Dead code | Unused functions, unreachable branches, commented-out code |
| Duplication | Copy-pasted logic that should be a shared function |
| Over-abstraction | Unnecessary wrappers, premature generalization |
| Boundary violations | Leaking internals, wrong-layer dependencies |
| Naming issues | Unclear names, inconsistent conventions |

### 3. Plan

Present findings to user as a prioritized cleanup plan. Wait for approval.

### 4. Execute (Separate Pass)

Apply approved cleanups. After each change:
- Run available tests to catch regressions
- Keep each cleanup as a separate, reviewable commit

### 5. Verify

Run full verification (`/verify`) after all cleanups complete.

Report: files changed, lines removed vs added, tests status.
