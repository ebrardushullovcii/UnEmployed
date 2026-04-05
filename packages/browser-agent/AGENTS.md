# Browser Agent

Owns LLM-driven browser workflows that sit on top of `@unemployed/browser-runtime`.

## Rules

- Keep site- or workflow-specific agent behavior here, not in the generic browser runtime.
- Return structured, schema-validated outputs that `packages/job-finder` can trust.
- Keep prompts, transcript compaction, and tool policy focused on bounded tasks instead of broad product logic.
- Do not let renderer or Electron layers depend on browser-agent internals directly.
