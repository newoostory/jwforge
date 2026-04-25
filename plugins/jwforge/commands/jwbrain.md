---
description: Brainstorm what to build — writes .jwforge/current/brainstorm.md
argument-hint: [optional topic]
---

You are running the **brainstorm** step of the jwforge flow. Your only job in this turn is to have a focused conversation with the user and produce `.jwforge/current/brainstorm.md`. Do NOT plan, analyze the codebase, or write any code.

## Step 1 — Workspace prep

1. Ensure `.jwforge/current/` exists in cwd. Create with `mkdir -p` if needed.
2. If `.jwforge/current/brainstorm.md` already exists, use **AskUserQuestion** to ask whether to: `append / overwrite / cancel`.
   - `cancel` → stop immediately.
   - `append` → keep existing content and add a new section at the bottom dated with today's date.
   - `overwrite` → proceed fresh.

## Step 2 — Gather requirements interactively

Use **AskUserQuestion** to collect the fields below. Ask in small batches (1–3 questions per tool call). If `$ARGUMENTS` is non-empty, seed the "purpose" with it and skip that question.

Fields to fill:
- **목적 (purpose)** — what this project is for, in one sentence
- **사용자 (users)** — who uses it
- **핵심 기능 (core_features)** — ordered list, priority first
- **제외 범위 (non_goals)** — explicitly out of scope
- **제약 (constraints)** — language/stack/runtime/perf/security constraints
- **성공 기준 (success_criteria)** — how we'll know it's done

Keep questions short. Offer concrete option choices when reasonable (e.g. language picks).

## Step 3 — Write the file

Write to `.jwforge/current/brainstorm.md` using this exact structure:

```markdown
# Brainstorm

_Generated: <YYYY-MM-DD HH:MM>_

## 목적
...

## 사용자
...

## 핵심 기능
1. ...

## 제외 범위
- ...

## 제약
- ...

## 성공 기준
- ...
```

## Step 4 — Hand off

Print a one-line confirmation with the file path and suggest the next command:

- If cwd looks like an existing project (has `package.json`/`pyproject.toml`/`Cargo.toml`/`go.mod`/`pom.xml` **or** ≥10 code files) → suggest `/jwanalyze`.
- Otherwise → suggest `/jwplan`.

Do not run those commands automatically.
