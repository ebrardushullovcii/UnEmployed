# Browser Agent

Owns LLM-driven browser workflow policy on top of `@unemployed/browser-runtime`.

## Rules

- Keep unavoidable site-specific extraction or navigation handling here, not in `job-finder` orchestration
- Do not treat one job board as a template for new hardcoded branches across the product; prefer prompt quality, generic heuristics, and evidence-driven behavior first
- Return structured, schema-validated outputs that `job-finder` can trust
- Keep prompts, compaction, and tool policy bounded to the task
- Do not let renderer or Electron layers depend on internals here
