---
notion_page_id: {{notion_page_id}}
notion_database_id: {{notion_database_id}}
created_at: {{created_at}}
pipeline_run_id: {{pipeline_run_id}}
conversation_source: {{conversation_source}}
---

# SelfDeep Report: {{report_title}}

## Executive Summary

- **Date**: {{report_date}}
- **Pipeline Run**: {{pipeline_run_id}}
- **Overall Status**: {{overall_status}}
- **Opportunities Found**: {{opportunities_count}}
- **Improvements Applied**: {{improvements_applied_count}}
- **Verification**: {{verification_status}}

{{executive_summary_narrative}}

---

## Opportunities Identified

### Analyzer Findings

| Priority | Category | Target File | Description |
|----------|----------|-------------|-------------|
{{#each analyzer_opportunities}}
| {{priority}} | {{category}} | `{{target}}` | {{description}} |
{{/each}}

### Research Findings

| Priority | Topic | Source | Applicability |
|----------|-------|--------|---------------|
{{#each researcher_findings}}
| {{priority}} | {{topic}} | {{source}} | {{applicability}} |
{{/each}}

---

## Improvements Applied

| # | Category | File | Description | Status |
|---|----------|------|-------------|--------|
{{#each improvements}}
| {{index}} | {{category}} | `{{file}}` | {{description}} | {{status}} |
{{/each}}

---

## Before / After Comparisons

{{#each before_after_comparisons}}
### {{title}}

**File**: `{{file}}`
**Category**: {{category}}

**Before:**
```
{{before}}
```

**After:**
```
{{after}}
```

**Rationale**: {{rationale}}

---
{{/each}}

---

## Verification Results

- **Status**: {{verifier_status}}
- **Tests Run**: {{verifier_tests_run}}
- **Auto-fix Attempted**: {{verifier_auto_fix_attempted}}
- **Auto-fix Result**: {{verifier_auto_fix_result}}

### Failures

{{#if verifier_failures}}
{{#each verifier_failures}}
- {{this}}
{{/each}}
{{else}}
None.
{{/if}}

---

## How to Apply

### 적용해 (Apply)

The following improvements are ready to apply:

{{apply_instructions}}

To apply all changes, run:

```bash
{{apply_command}}
```

### 적용하지마 (Do Not Apply)

The following items were identified but **not** applied, requiring manual review:

{{skip_instructions}}

---

## Notes

{{additional_notes}}
