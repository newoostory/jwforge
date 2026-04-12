# Task Spec: {{task_title}}

<!-- Example: # Task Spec: Add OAuth2 Login via GitHub -->

## Classification
- type: {{new-feature | bug-fix | refactor | config | docs}}
- complexity: {{S | M | L | XL}}

<!-- Complexity guide:
  S = single-file change, no design phase required
  M = multi-file change, 1–2 days of work
  L = system-level change, cross-cutting concerns, 3–5 days
  XL = architectural change or large feature, 1+ week
-->

## Problem Statement
{{problem_statement}}

<!-- Example:
  The current authentication system only supports email/password login. Users
  are requesting social login options. GitHub OAuth2 is the highest-priority
  request, affecting ~40% of the target audience who are developers.
  Without this, sign-up friction remains high and conversion rate suffers.
-->

## Requirements

### Must (Required)
- {{required_item_1}}
- {{required_item_2}}

<!-- Example Must items:
  - Implement GitHub OAuth2 callback route at /auth/github/callback
  - Store OAuth provider ID and access token in users table
  - Return signed JWT on successful OAuth login (same format as email login)
  - Handle OAuth errors with user-friendly redirect to /login?error=oauth_failed
-->

### Nice-to-have (Optional)
- {{optional_item_1}}

<!-- Example Nice-to-have items:
  - Support Google OAuth2 as a second provider
  - Show connected accounts on the user profile settings page
  - Allow unlinking a social account if email/password login exists
-->

## Technical Context
- stack: {{language/framework}}
- source_root: {{absolute path to project root}}
- affected_files: {{list of affected existing files}}
- new_files: {{list of new files to create}}
- dependencies: {{required dependencies}}
- deploy_command: {{optional — command to deploy/install after changes, e.g. bash install.sh}}

<!-- affected_files vs new_files guidance:
  affected_files = files that already exist and will be MODIFIED.
    List them with a parenthetical describing the change.
    Example: src/auth/router.ts (add /github/callback route)

  new_files = files that do NOT yet exist and will be CREATED.
    Example: src/auth/github-oauth.ts (new OAuth2 handler module)

  Keep both lists complete and accurate — Executors scope their work to these lists.
  If a file is not listed here, an Executor MUST update the architecture before editing it.
-->

<!-- Example Technical Context:
  - stack: TypeScript / Node.js / Express / PostgreSQL
  - source_root: /home/user/myapp/
  - affected_files:
    - src/auth/router.ts (add OAuth routes)
    - src/db/schema.sql (add oauth_provider, oauth_id columns to users)
    - src/auth/jwt.ts (reuse existing token signing — no change needed, just import)
  - new_files:
    - src/auth/github-oauth.ts (new module: exchange code for token, fetch user profile)
  - dependencies: passport, passport-github2 (npm)
  - deploy_command: npm run build && pm2 reload app
-->

## Codebase Patterns

### Naming Conventions
{{naming_conventions}}

<!-- Example:
  - Files: kebab-case (e.g. github-oauth.ts, user-profile.tsx)
  - Functions: camelCase (e.g. fetchUserProfile, handleOAuthCallback)
  - Types/Interfaces: PascalCase with I-prefix for interfaces (e.g. IUser, OAuthPayload)
  - DB columns: snake_case (e.g. oauth_provider, created_at)
  - Constants: UPPER_SNAKE_CASE (e.g. TOKEN_EXPIRY_SECONDS)
-->

### Code Style
{{code_style}}

<!-- Example:
  - Async functions use async/await, not Promise chains
  - Errors are thrown as typed Error subclasses (AuthError, DatabaseError)
  - All external API calls wrapped in try/catch with explicit error logging
  - No magic values: constants go in src/config/constants.ts
  - Unit tests co-located with source files as *.test.ts
-->

### Key Existing Utilities
{{key_existing_utilities}}

<!-- Example:
  - src/auth/jwt.ts exports signToken(userId: string): string — use this for all JWT creation
  - src/db/client.ts exports pool: Pool — use this for all DB queries
  - src/middleware/auth.ts exports requireAuth middleware — reuse on protected routes
  - src/logger.ts exports logger (Winston) — use for all logging (not console.log)
-->

## Constraints
- {{constraint_1}}

<!-- Constraint guidance:
  List hard limits the implementation MUST NOT violate. Examples:
  - Do not introduce new npm dependencies without approval
  - Do NOT touch focus-sanctuary files (out of scope)
  - All source changes go to /home/user/jwforge/ — not directly to ~/.claude/
  - Maintain backward compatibility: existing email/password login must continue to work
  - No changes to the public API contract (existing clients must not break)
-->

## Success Criteria
- [ ] {{criterion_1}}
- [ ] {{criterion_2}}

<!-- Success Criteria guidance:
  Each criterion should be independently verifiable (testable or observable).
  Avoid vague criteria like "works correctly" — be specific. Examples:
  - [ ] GET /auth/github redirects to GitHub authorization URL
  - [ ] POST /auth/github/callback with valid code returns { token: "..." } (200 OK)
  - [ ] POST /auth/github/callback with invalid code redirects to /login?error=oauth_failed
  - [ ] users table has oauth_provider and oauth_id columns after migration runs
  - [ ] Existing email/password login flow unchanged (no regression)
  - [ ] install.sh runs successfully after all source changes
-->

## Interview Summary
- total_rounds: {{N}}
- key_decisions: {{list of important decisions made during interview}}
- final_confidence: {{percentage}}%

<!-- Include this section when produced by /deep or /deeptk pipeline interview phase.
  key_decisions should capture non-obvious choices made during the interview, e.g.:
  - Scope limited to GitHub OAuth only (Google deferred to separate task)
  - Use passport library rather than raw OAuth implementation (simpler, battle-tested)
  - Token format kept identical to email login (no separate oauth-specific token)
-->

## Context Strategy
- haiku_collectors: {{number of collectors used, or "skipped"}}
- context_compression: {{how haiku results were compressed for downstream use}}
- agent_context_passing: {{summary of what agents receive in their prompts vs what they read themselves}}

<!-- Context Strategy documents how context was managed during this pipeline run.
  This helps future runs optimize token usage. Examples:
  - haiku_collectors: 2 (structure-scanner + code-finder)
  - context_compression: haiku results compressed to 8 bullet points
  - agent_context_passing: Executors receive file paths + one-line summaries; read files themselves
-->

## Assumptions
- {{items where user did not confirm, filled with default values}}

<!-- Assumptions are safe defaults the Conductor chose when the user did not specify.
  Each assumption should be phrased as key: "value" — reason. Examples:
  - token_expiry: "7 days" — matches existing email login token lifetime
  - error_redirect: "/login?error=oauth_failed" — follows existing error redirect pattern
  - db_migration: "manual migration script" — project has no auto-migration setup
  If any assumption is wrong, it should surface in Phase 1 review before implementation.
-->
