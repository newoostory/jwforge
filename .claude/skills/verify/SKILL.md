---
name: verify
description: "Run all available verification checks: lint, typecheck, tests, and report evidence"
user-invocable: true
argument-hint: [optional scope or file path]
---

# JWForge Verify

Run all available verification checks and report results with evidence. Use this to confirm changes don't break anything.

## Steps

### 1. Detect Available Checks

Scan the project for available verification tools:

| Check | Detection | Command |
|-------|-----------|---------|
| TypeScript | `tsconfig.json` | `npx tsc --noEmit` |
| ESLint | `.eslintrc*` or `eslint.config.*` | `npx eslint .` |
| Prettier | `.prettierrc*` | `npx prettier --check .` |
| Jest | `jest.config.*` or package.json "jest" | `npx jest --passWithNoTests` |
| Vitest | `vitest.config.*` | `npx vitest run` |
| Pytest | `pytest.ini` or `pyproject.toml` | `pytest` |
| Go test | `go.mod` | `go test ./...` |
| Cargo test | `Cargo.toml` | `cargo test` |
| Make test | `Makefile` with test target | `make test` |

### 2. Run Checks

Run all detected checks via Bash. If `$ARGUMENTS` specifies a scope, limit checks to that area.

Run independent checks in parallel where possible.

### 3. Report

```markdown
## Verification Report

| Check | Status | Details |
|-------|--------|---------|
| TypeScript | PASS/FAIL | {error count or "clean"} |
| ESLint | PASS/FAIL | {warning/error count} |
| Tests | PASS/FAIL | {passed}/{total} |
| ... | ... | ... |

### Issues Found
- {file:line}: {description}

### Verdict: PASS / FAIL
```

### 4. If Scoped to Pipeline

If `.jwforge/current/state.json` exists and is in Phase 4, update state with verification results.
