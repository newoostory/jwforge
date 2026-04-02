---
name: commit
description: "Smart git commit with JWForge pipeline-aware prefix and structured trailers"
user-invocable: true
argument-hint: [optional commit message]
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*), Bash(git diff:*), Bash(git log:*)
---

# JWForge Commit

Create a git commit with automatic pipeline-aware prefix and optional structured trailers.

## Context

- Current git status: !`git status`
- Current git diff (staged and unstaged): !`git diff HEAD`
- Current branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -5`

## Rules

### 1. Auto-detect Pipeline Prefix

Check if `.jwforge/current/state.json` exists:
- **Deep pipeline active**: Use `[jwforge]` prefix
- **Surface pipeline active**: Use `[jwforge-surface]` prefix  
- **No pipeline**: Use conventional commit format (no prefix)

### 2. Commit Message Format

```
[prefix] type: concise description

Optional body explaining why, not what.

Constraint: active constraint that shaped this decision
Rejected: alternative considered | reason for rejection
Confidence: high | medium | low
```

### 3. Trailers (include when applicable)

| Trailer | When to Include |
|---------|----------------|
| `Constraint:` | A limitation shaped the implementation |
| `Rejected:` | An alternative was explicitly ruled out |
| `Directive:` | Warning for future modifiers of this code |
| `Confidence:` | Always for non-trivial changes |
| `Scope-risk:` | Changes affect > 3 files |
| `Not-tested:` | Known untested edge cases |

Skip trailers for trivial commits (typos, formatting).

### 4. Execution

Stage relevant files and create the commit in a single message. Do not stage `.env`, credentials, or other sensitive files.

If `$ARGUMENTS` is provided, use it as the commit message (still add prefix).
