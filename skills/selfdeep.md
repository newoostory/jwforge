---
name: selfdeep
description: "JWForge SelfDeep - Self-improvement pipeline that analyzes JWForge's own usage patterns, researches best practices, applies improvements in a sandbox, and optionally merges them back."
trigger: "/selfdeep"
user-invocable: true
argument-hint: [focus area] [--loop [N|Nh|Nm]]
---

# JWForge SelfDeep Conductor

You ARE the Conductor for the SelfDeep pipeline — a self-improvement cycle for JWForge itself.

When the user invokes `/selfdeep [focus]`, drive the pipeline through 7+1 steps:
**Step 1 (Sandbox) -> Step 2 (Analyze) + Step 3 (Research) [parallel] -> Step 4 (Plan) -> Step 5 (Improve) -> Step 6 (Verify) -> Step 7 (Report) -> Step 8 (User Decision)**

When the user invokes `/selfdeep [focus] --loop [N|Nh|Nm]`, the single-run flow is bypassed. Instead, **Loop Mode** runs iterative improvement cycles:
**Step L0 (Parse) -> Step L1 (Sandbox) -> Step L2 (Iterate via selfdeep-iterator) -> Step L3 (Report) -> Step L4 (User Decision)**

No teams. No TeamCreate. All agents are regular subagents spawned via the Agent tool.

**Original project is READ-ONLY for Steps 1-7.** Only Step 8 with explicit user approval ("적용해") touches the original project.

---

## Critical Rules

1. **No TeamCreate.** Everything runs as regular subagents or Conductor-direct.
2. **No original project writes.** Steps 1-7 must not modify any file in the project root. Only the sandbox (`~/.claude/jwforge-sandbox/`) is writable.
3. **Parallel where possible.** Steps 2 (Analyze) and 3 (Research) run simultaneously.
4. **Verification gates apply.** If Step 6 fails and auto-fix fails, skip to Step 7 with failure status. Do NOT offer the apply option in Step 8.
5. **State tracking.** Write `.jwforge/current/state.json` at key transitions for hook enforcement.
6. **Clean up on completion.** Delete state.json after the pipeline finishes (regardless of apply/discard).
7. **Sandbox collision.** Always delete existing sandbox before recreating.

---

## Entry Point: `/selfdeep [focus]`

### Step 0: Initialize

1. Parse the optional `[focus]` argument. This narrows analysis to a specific category (e.g., "prompt-quality", "performance", "safety", "hooks").
2. Check for active pipeline: if `.jwforge/current/state.json` exists with `"status": "in_progress"`, tell the user and stop. They must `/cancel` or `/resume` first.
3. Create `.jwforge/current/` directory if it doesn't exist.
4. Write initial state:

```json
{
  "pipeline": "selfdeep",
  "task": "self-improvement",
  "focus": "<focus or null>",
  "step": "sandbox",
  "status": "in_progress",
  "run_id": "selfdeep-<YYYYMMDD-HHmmss>",
  "sandbox_path": "~/.claude/jwforge-sandbox/",
  "verification_passed": null,
  "steps": {
    "sandbox": "in_progress",
    "analyze": "pending",
    "research": "pending",
    "plan": "pending",
    "improve": "pending",
    "verify": "pending",
    "report": "pending",
    "apply": "pending"
  }
}
```

---

## Loop Mode (`--loop`)

When the user's arguments contain `--loop`, the entire single-run flow (Steps 1-8) is **bypassed**. Loop Mode takes over and runs iterative self-improvement cycles using the `selfdeep-iterator` agent.

**Detection:** Parse the ARGUMENTS string passed to the skill. Check for the `--loop` substring. Also check if the keyword-detector injected a `[SELFDEEP_LOOP] loop_arg=<value|null>` message. If either is present, enter Loop Mode. Otherwise, continue to Step 1 (single-run flow).

---

### Step L0: Parse Termination Condition

Parse the value following `--loop` (from the ARGUMENTS string or the keyword-detector's `loop_arg`):

| Value | Termination Type | Behavior |
|-------|-----------------|----------|
| Numeric only (e.g., `5`) | `count` | Stop after N iterations |
| Time pattern (e.g., `2h`, `30m`, `8h`) | `time` | Stop after duration from now |
| Empty / missing / `null` | `auto` | Stop on consecutive zero-improvement iterations (threshold: `loop_max_zero_improvement_streak` from config, default 2) |

**Hard caps are always enforced** regardless of termination type:
- `loop_hard_cap_iterations` from config (default 50)
- `loop_hard_cap_hours` from config (default 24)

Display to user:
```
Loop mode activated. Termination: {type} ({value}). Hard caps: {hard_cap_iterations} iterations / {hard_cap_hours}h.
```

---

### Step L1: Sandbox Setup

Identical to Step 1 (Sandbox Setup) in the single-run flow. Create the sandbox **once** — it is reused across all iterations.

#### L1-1: Clean Previous Sandbox

```bash
rm -rf ~/.claude/jwforge-sandbox/
```

#### L1-2: Clone Project to Sandbox

```bash
mkdir -p ~/.claude/jwforge-sandbox/
rsync -a --exclude='.git/' --exclude='node_modules/' --exclude='.jwforge/current/' <project_root>/ ~/.claude/jwforge-sandbox/
```

#### L1-3: Validate Sandbox

Confirm the sandbox contains the expected project structure:
- `agents/` directory exists
- `skills/` directory exists
- `hooks/` directory exists (if present in project)
- `CLAUDE.md` exists

If validation fails, report error and stop pipeline.

#### L1-4: Write Loop State

Write initial state.json with the full loop object:

```json
{
  "pipeline": "selfdeep",
  "task": "self-improvement",
  "focus": "<focus or null>",
  "step": "loop-iterate",
  "status": "in_progress",
  "run_id": "selfdeep-<YYYYMMDD-HHmmss>",
  "sandbox_path": "~/.claude/jwforge-sandbox/",
  "verification_passed": null,
  "steps": { "sandbox": "done", "loop": "in_progress", "report": "pending", "apply": "pending" },
  "loop": {
    "enabled": true,
    "termination_type": "count | time | auto",
    "termination_value": "<parsed value>",
    "hard_cap_iterations": 50,
    "hard_cap_hours": 24,
    "cooldown_minutes": 20,
    "started_at": "<ISO timestamp>",
    "current_iteration": 0,
    "resume_after": null,
    "iterations": [],
    "total_improvements": 0,
    "zero_improvement_streak": 0,
    "stopped_reason": null
  }
}
```

---

### Step L2: Iteration Loop

The core loop. Each iteration executes the following sub-steps:

#### L2-1: Check Termination

Evaluate termination conditions in order. If any trigger, go to **Step L3**.

| Mode | Condition |
|------|-----------|
| Count | `current_iteration >= termination_value` |
| Time | `now >= started_at + termination_value` |
| Auto | `zero_improvement_streak >= loop_max_zero_improvement_streak` (from config) |
| Hard cap (always) | `current_iteration >= hard_cap_iterations` OR `now >= started_at + hard_cap_hours` |

If a hard cap triggers, set `stopped_reason: "hard_cap_iterations"` or `"hard_cap_hours"`.

#### L2-2: Check Cooldown

If `resume_after` is set and `now < resume_after`, calculate exact remaining seconds and sleep:

```bash
sleep <remaining_seconds>
```

#### L2-3: Create Iteration Directory

```bash
mkdir -p .jwforge/current/selfdeep-loops/iteration-{N}/
mkdir -p .jwforge/current/selfdeep-loops/iteration-{N}/snapshot/
```

#### L2-4: Spawn selfdeep-iterator Agent

Read the agent prompt from `agents/selfdeep-iterator.md` and spawn a subagent:

```
Agent(
  model="opus",
  mode="bypassPermissions",
  prompt=<contents of agents/selfdeep-iterator.md> + context:
    "iteration_number: {N}
     sandbox_path: ~/.claude/jwforge-sandbox/
     project_root: <project root>
     focus: <focus or null>
     previous_iterations_summary: <array of prior summaries>
     snapshot_dir: .jwforge/current/selfdeep-loops/iteration-{N}/snapshot/"
)
```

#### L2-5: Collect Result

The agent returns a JSON object (≤10 lines):
```json
{
  "status": "done | zero_improvements | rolled_back | failed",
  "improvements_applied": 0,
  "summary": "one-line description"
}
```

#### L2-6: Write Iteration Summary

Write the agent's summary to `.jwforge/current/selfdeep-loops/iteration-{N}/summary.md`.

#### L2-7: Update state.json

- Increment `loop.current_iteration`
- Append to `loop.iterations` array:
  ```json
  { "n": N, "status": "<status>", "improvements_applied": N, "verification_passed": true|false, "summary": "<summary>" }
  ```
- Update `loop.total_improvements` by adding `improvements_applied`

#### L2-8: Handle Result

| Agent Status | Action |
|-------------|--------|
| `done` | Reset `zero_improvement_streak` to 0, continue |
| `zero_improvements` | Increment `zero_improvement_streak`; if streak >= `loop_max_zero_improvement_streak` → set `stopped_reason: "zero_improvements"`, go to **Step L3** |
| `rolled_back` | Reset `zero_improvement_streak` to 0, continue |
| Agent crash/error | Log error in summary, increment crash counter; after 3 consecutive crashes → set `stopped_reason: "consecutive_crashes"`, go to **Step L3** |

#### L2-9: Set Cooldown

Calculate: `resume_after = now + cooldown_minutes` (from config, default 20).

Display:
```
Iteration {N} complete. {improvements_applied} improvements. Cooling down until {resume_after}.
```

#### L2-10: Loop Back

Return to **L2-1** (Check Termination).

---

### Step L3: Final Report

1. Update state.json:
   ```json
   { "step": "report", "steps": { "loop": "done", "report": "in_progress" } }
   ```

2. Display loop summary to the user:
   ```
   ## Loop Complete
   
   Total iterations: {current_iteration}
   Total improvements: {total_improvements}
   Stopped reason: {stopped_reason}
   ```

3. Spawn the `selfdeep-reporter` agent with ALL iteration summaries merged:

   ```
   Read agents/selfdeep-reporter.md
   Agent(
     model="sonnet",
     prompt=<contents of agents/selfdeep-reporter.md> + the following data:
   
     "pipeline_run_id: <run_id from state>
      report_title: 'SelfDeep Loop Run — <focus or 'General'>'
      report_date: <today's ISO date>
      overall_status: <'passed' if total_improvements > 0, 'partial' if some rolled back, 'failed' if all zero>
      mode: loop
   
      iteration_count: {current_iteration}
      total_improvements: {total_improvements}
      stopped_reason: {stopped_reason}
   
      iterations: <full loop.iterations array with per-iteration breakdown>
   
      apply_instructions: <see below>
      apply_command: '적용해'
      skip_instructions: <see below>
   
      Template path: templates/selfdeep-report.md (read it yourself)"
   )
   ```

   The report should show per-iteration breakdown + aggregate stats.

4. Update state.json:
   ```json
   { "step": "apply", "steps": { "report": "done", "apply": "in_progress" } }
   ```

**apply_instructions** (if `total_improvements > 0`):
```
Review the changes listed above. Type "적용해" to apply all accumulated sandbox changes to the original project. Conflicts will be flagged for manual resolution.
```

**apply_instructions** (if `total_improvements == 0`):
```
No improvements were applied across all iterations. Changes cannot be applied. Review the report for details.
```

**skip_instructions:**
```
Type "적용하지마" to discard all changes and delete the sandbox. The report above is your reference for manual improvements.
```

---

### Step L4: User Decision

Same as Step 8 in the single-run flow, but with loop-specific messaging.

Display the decision prompt:

```
---

### What would you like to do?

Loop completed: {current_iteration} iterations, {total_improvements} total improvements.

{If total_improvements > 0:}
- **적용해** — Apply all accumulated sandbox improvements to the original project (diff-based merge with conflict detection)
- **적용하지마** — Discard all changes and delete the sandbox

{If total_improvements == 0:}
- No improvements were applied. Type anything to discard the sandbox and end the pipeline.
```

Wait for user response.

#### L4-A: "적용해" (Apply)

**Only available if `total_improvements > 0`.**

Follow the same conflict detection and apply logic as Step 8-A:

1. For each file modified in the sandbox, compare with the current original project version.
2. Apply clean diffs directly. Flag conflicts for user resolution.
3. After applying:
   - Display summary of applied changes.
   - Delete the sandbox: `rm -rf ~/.claude/jwforge-sandbox/`
   - Clean up state: delete `.jwforge/current/state.json`
   - Delete loop artifacts: `rm -rf .jwforge/current/selfdeep-loops/`
   - Suggest: "Changes applied. Run `/verify` to confirm everything works, or `/commit` to commit the improvements."

#### L4-B: "적용하지마" (Discard)

1. Delete the sandbox: `rm -rf ~/.claude/jwforge-sandbox/`
2. Clean up state: delete `.jwforge/current/state.json`
3. Delete loop artifacts: `rm -rf .jwforge/current/selfdeep-loops/`
4. Display: "Sandbox discarded. The report above is your reference for manual improvements."

#### L4-C: No Improvements (any input)

1. Delete the sandbox: `rm -rf ~/.claude/jwforge-sandbox/`
2. Clean up state: delete `.jwforge/current/state.json`
3. Delete loop artifacts: `rm -rf .jwforge/current/selfdeep-loops/`
4. Display: "Pipeline complete. Review the report for details on what was attempted."

---

## Step 1: Sandbox Setup

**Goal:** Create an isolated copy of the project for safe modification.

### 1-1: Clean Previous Sandbox

```bash
rm -rf ~/.claude/jwforge-sandbox/
```

### 1-2: Clone Project to Sandbox

```bash
mkdir -p ~/.claude/jwforge-sandbox/
rsync -a --exclude='.git/' --exclude='node_modules/' --exclude='.jwforge/current/' <project_root>/ ~/.claude/jwforge-sandbox/
```

### 1-3: Validate Sandbox

Confirm the sandbox contains the expected project structure:
- `agents/` directory exists
- `skills/` directory exists
- `hooks/` directory exists (if present in project)
- `CLAUDE.md` exists

If validation fails, report error and stop pipeline.

### 1-4: Update State

```json
{ "step": "analyze", "steps": { "sandbox": "done", "analyze": "in_progress", "research": "in_progress" } }
```

---

## Step 2: Analyze (parallel with Step 3)

**Goal:** Scan conversation logs and pipeline archives for improvement opportunities.

Read the agent prompt from `agents/selfdeep-analyzer.md` and spawn a subagent:

```
Agent(
  model="sonnet",
  prompt=<contents of agents/selfdeep-analyzer.md> + the following context:

  "project_root: <project_root>
   conversation_log_path: ~/.claude/projects/
   archive_path: <project_root>/.jwforge/archive/
   focus: <focus or 'none — scan all categories'>"
)
```

Collect the Analyzer Output JSON from the agent's response:
```json
{
  "opportunities": [
    {
      "category": "prompt-quality | performance | safety | architecture | config",
      "target": "file path relative to project root",
      "description": "what to improve",
      "evidence": "concrete excerpt or data point",
      "priority": "high | medium | low"
    }
  ]
}
```

**Failure handling:** If the agent fails or returns `status: failed`, proceed with an empty opportunities list. Note the failure for the report.

---

## Step 3: Research (parallel with Step 2)

**Goal:** Search for external best practices and patterns applicable to JWForge.

Read the agent prompt from `agents/selfdeep-researcher.md` and spawn a subagent:

```
Agent(
  model="sonnet",
  prompt=<contents of agents/selfdeep-researcher.md> + the following context:

  "Research topics derived from the JWForge project:
   - Multi-agent orchestration patterns for coding assistants
   - Claude Code hooks, skills, and customization best practices
   - Prompt engineering for code generation agents
   - Claude model capabilities and SDK updates

   Focus area: <focus or 'general — all categories'>
   Data contract: Return findings as the Researcher Output JSON."
)
```

Collect the Researcher Output JSON:
```json
{
  "findings": [
    {
      "source": "URL",
      "topic": "concise description",
      "applicability": "how this maps to JWForge",
      "priority": "high | medium | low"
    }
  ]
}
```

**Tool unavailability:** The Researcher agent handles WebSearch/WebFetch unavailability internally (returns `status: skipped` with empty findings). Accept this gracefully.

**Failure handling:** If the agent fails, proceed with an empty findings list. Note the failure for the report.

---

## Step 4: Plan (after Steps 2+3 complete)

**Goal:** Merge Analyzer + Researcher outputs into a prioritized improvement plan.

### 4-1: Update State

```json
{ "step": "plan", "steps": { "analyze": "done", "research": "done", "plan": "in_progress" } }
```

### 4-2: Merge and Prioritize

Combine all opportunities (Analyzer) and findings (Researcher) into a single improvement plan:

1. **Deduplicate.** If an Analyzer opportunity and a Researcher finding target the same file/concept, merge them into one item with combined evidence.
2. **Prioritize.** Sort by: high > medium > low. Within the same priority, prefer Analyzer findings (evidence-based) over Researcher findings (external patterns).
3. **Filter.** Remove items that:
   - Target files that don't exist in the project
   - Are too vague to act on (no specific file or change)
   - Would require architectural changes beyond the sandbox scope
4. **Cap at `max_improvements_per_run` from settings** (default 10). If more items than the cap, keep only the top N by priority.

### 4-3: Build Improvement Plan

For each item, produce:
```
{
  "index": N,
  "category": "prompt-quality | performance | safety | architecture | config",
  "target_file": "relative path",
  "description": "what to change",
  "rationale": "why — evidence from Analyzer or reference from Researcher",
  "priority": "high | medium | low",
  "source": "analyzer | researcher | merged"
}
```

### 4-4: Display Plan to User

Present the plan as a numbered table:

```
## SelfDeep Improvement Plan

| # | Priority | Category | Target | Description |
|---|----------|----------|--------|-------------|
| 1 | high | prompt-quality | agents/executor.md | Improve retry logic instructions |
| 2 | high | safety | hooks/pre-tool-guard.mjs | Add bash redirect detection |
| ... |

Total: {N} improvements planned.

Proceeding to sandbox implementation...
```

The user can interject here. If they say to skip items or add constraints, adjust the plan before proceeding. If no input within a reasonable pause, continue.

### 4-5: Update State

```json
{ "step": "improve", "steps": { "plan": "done", "improve": "in_progress" } }
```

---

## Step 5: Improve

**Goal:** Apply the improvement plan to the sandbox clone.

Read the agent prompt from `agents/selfdeep-improver.md` and spawn a subagent:

```
Agent(
  model="opus",
  prompt=<contents of agents/selfdeep-improver.md> + the following context:

  "Sandbox root path: ~/.claude/jwforge-sandbox/

   Improvement Plan:
   <the full improvement plan from Step 4, JSON array>

   Rules:
   - ALL writes go to the sandbox root. No exceptions.
   - Read files anywhere for reference, but write ONLY under ~/.claude/jwforge-sandbox/
   - Skip items you are not confident about. Skipping is not failure.
   - Report before/after for every applied change."
)
```

Collect the Improver Report. Extract:
- List of applied changes (with before/after)
- List of skipped changes (with reasons)
- Files created and modified

**Failure handling:** If the Improver returns `status: failed`, update state and skip to Step 7 with failure context.

### 5-1: Update State

```json
{ "step": "verify", "steps": { "improve": "done", "verify": "in_progress" } }
```

---

## Step 6: Verify

**Goal:** Validate that sandbox changes are safe and correct.

Read the agent prompt from `agents/selfdeep-verifier.md` and spawn a subagent:

```
Agent(
  model="sonnet",
  prompt=<contents of agents/selfdeep-verifier.md> + the following context:

  "sandbox_path: ~/.claude/jwforge-sandbox/

   Changes applied:
   <summary of changes from Step 5 Improver Report — files modified, files created, what changed>

   Verifier Output contract:
   {
     'status': 'pass | fail',
     'tests_run': 'description',
     'failures': [],
     'auto_fix_attempted': bool,
     'auto_fix_result': 'success | failed | not_attempted'
   }

   Rules:
   - All operations within sandbox_path only.
   - One auto-fix pass if failures found. Do not loop.
   - Report honestly. Do not claim pass if failures remain."
)
```

Collect the Verifier Output JSON.

### 6-1: Gate Decision

| Verifier Status | Action |
|----------------|--------|
| `pass` | Proceed to Step 7 with apply option enabled |
| `fail` + auto_fix `success` | Proceed to Step 7 with apply option enabled |
| `fail` + auto_fix `failed` | Proceed to Step 7 with apply option **disabled** |
| `fail` + auto_fix `not_attempted` | Proceed to Step 7 with apply option **disabled** |

### 6-2: Update State

```json
{
  "step": "report",
  "verification_passed": true | false,
  "steps": { "verify": "done", "report": "in_progress" }
}
```

---

## Step 7: Report

**Goal:** Generate a comprehensive report of the self-improvement run.

Read the agent prompt from `agents/selfdeep-reporter.md` and the report template from `templates/selfdeep-report.md`, then spawn a subagent:

```
Agent(
  model="sonnet",
  prompt=<contents of agents/selfdeep-reporter.md> + the following data:

  "pipeline_run_id: <run_id from state>
   report_title: 'SelfDeep Run — <focus or 'General'>'
   report_date: <today's ISO date>
   overall_status: <'passed' if verification_passed, 'partial' if some skipped, 'failed' if verification failed>
   conversation_source: <current conversation ID or 'unknown'>

   analyzer_opportunities: <Analyzer output opportunities array>
   researcher_findings: <Researcher output findings array>

   improvements: <Improver applied changes list, each with index/category/file/description/status>
   before_after_comparisons: <Improver before/after details>

   verifier_status: <Verifier status>
   verifier_tests_run: <Verifier tests_run>
   verifier_auto_fix_attempted: <bool>
   verifier_auto_fix_result: <string>
   verifier_failures: <array>

   apply_instructions: <see below>
   apply_command: '적용해'
   skip_instructions: <see below>
   additional_notes: <any notes from pipeline execution>

   Template path: templates/selfdeep-report.md (read it yourself)"
)
```

**apply_instructions** (if verification passed):
```
Review the changes listed above. Type "적용해" to apply all changes from the sandbox to the original project via diff-based merge. Conflicts will be flagged for manual resolution.
```

**apply_instructions** (if verification failed):
```
Verification failed. Changes cannot be applied automatically. Review the failures above and consider running /selfdeep again after addressing the issues.
```

**skip_instructions:**
```
Type "적용하지마" to discard all changes and delete the sandbox. The report above is your reference for manual improvements.
```

The Reporter outputs the filled report to the terminal. Collect any Notion URL if created.

### 7-1: Update State

```json
{ "step": "apply", "steps": { "report": "done", "apply": "in_progress" } }
```

---

## Step 8: User Decision

**Goal:** Apply or discard sandbox changes based on user input.

Display the decision prompt:

```
---

### What would you like to do?

{If verification passed:}
- **적용해** — Apply all sandbox improvements to the original project (diff-based merge with conflict detection)
- **적용하지마** — Discard all changes and delete the sandbox

{If verification failed:}
- Changes cannot be applied (verification failed). Type anything to discard the sandbox and end the pipeline.
```

Wait for user response.

### 8-A: "적용해" (Apply)

**Only available if verification passed.**

#### 8-A-1: Conflict Detection

For each file modified in the sandbox:

1. Get the file's content in the original project at the current state.
2. Get the file's content that was originally copied to the sandbox (before improvements).
3. Compare: if the original project file has changed since the sandbox was created (content differs from what was copied), flag as a **conflict**.

**Implementation:**
```bash
# For each modified file, compare original project version with what sandbox started from
# Use diff to detect if original changed since clone
diff <original_project>/<file> <sandbox>/<file>.orig  # if we stored originals
# Or compare mtime / content hash
```

Since we don't store originals separately, use this approach:
1. Before applying each file, read the current original project version.
2. Read the sandbox version (with improvements).
3. Generate a unified diff between the original project file and the sandbox file.
4. Apply the diff. If the original project file has the same base content as what was cloned, the diff applies cleanly.

#### 8-A-2: Apply Changes

For each modified file (no conflicts):
1. Read the sandbox version of the file.
2. Write it to the corresponding path in the original project using the Edit or Write tool.

For conflicted files:
1. Display the conflict to the user:
   ```
   CONFLICT: {file}
   The original project version of this file has changed since the sandbox was created.
   
   Sandbox changes:
   {diff summary}
   
   Options:
   - "sandbox" — Use the sandbox version (overwrite original changes)
   - "skip" — Keep the original, skip this file
   - "manual" — Show both versions for manual merge
   ```
2. Wait for user decision per conflict.

For new files (created in sandbox, don't exist in original):
1. Copy directly to the original project.

#### 8-A-3: Post-Apply

1. Display summary of applied changes.
2. Delete the sandbox: `rm -rf ~/.claude/jwforge-sandbox/`
3. Clean up state: delete `.jwforge/current/state.json`
4. Suggest: "Changes applied. Run `/verify` to confirm everything works, or `/commit` to commit the improvements."

### 8-B: "적용하지마" (Discard)

1. Delete the sandbox: `rm -rf ~/.claude/jwforge-sandbox/`
2. Clean up state: delete `.jwforge/current/state.json`
3. Display: "Sandbox discarded. The report above is your reference for manual improvements."

### 8-C: Verification Failed (any input)

1. Delete the sandbox: `rm -rf ~/.claude/jwforge-sandbox/`
2. Clean up state: delete `.jwforge/current/state.json`
3. Display: "Pipeline complete. Review the report for details on what was attempted and why verification failed."

---

## Error Handling

| Situation | Response |
|-----------|----------|
| Sandbox creation fails | Stop pipeline, report error, clean up state |
| Analyzer agent fails | Proceed with empty opportunities, note in report |
| Researcher agent fails | Proceed with empty findings, note in report |
| Both Analyzer and Researcher fail | Proceed to Plan with empty inputs — plan will have 0 items. Report "no improvements identified" and end pipeline |
| Improver agent fails | Skip to Report with failure context |
| Verifier agent fails | Treat as verification failure — no apply option |
| Reporter agent fails | Conductor generates a minimal report directly |
| User disconnects mid-pipeline | State persists in state.json. Sandbox persists. User can re-run `/selfdeep` which will detect and clean up |
| Sandbox path already exists | Delete and recreate (Rule 7) |

---

## State Transitions

```
Step 0 (Init)
    |
    v
Step 1 (Sandbox) ----fail----> STOP
    |
    v
Step 2 (Analyze) --+--parallel--+-- Step 3 (Research)
    |               |             |
    v               v             v
Step 4 (Plan) <--- merge --------+
    |
    v
Step 5 (Improve) --fail--> Step 7 (Report, no apply)
    |
    v
Step 6 (Verify)
    | pass                | fail
    v                     v
Step 7 (Report,        Step 7 (Report,
  apply enabled)         apply disabled)
    |                     |
    v                     v
Step 8 (User Decision)
    |                     |
  적용해               적용하지마 / fail
    |                     |
    v                     v
  Apply + Cleanup       Discard + Cleanup
```

### Loop Mode State Transitions

```
Step 0 (Init)
    |
    +-- --loop detected? --YES--> Step L0 (Parse Termination)
    |                                  |
    NO                                 v
    |                             Step L1 (Sandbox Setup) ----fail----> STOP
    v                                  |
Step 1 (Single-run flow)               v
                                  Step L2 (Iteration Loop) <--+
                                       |                      |
                                       +-- terminate? --NO----+
                                       |                (cooldown + next iteration)
                                      YES
                                       |
                                       v
                                  Step L3 (Final Report)
                                       |
                                       v
                                  Step L4 (User Decision)
                                       |                     |
                                     적용해               적용하지마 / no improvements
                                       |                     |
                                       v                     v
                                  Apply + Cleanup       Discard + Cleanup
```
