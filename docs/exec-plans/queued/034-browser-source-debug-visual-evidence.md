# 034 Browser Source-Debug Visual Evidence

Status: ready

## Goal

- Use omni vision to improve existing browser discovery and source-debug reliability when DOM, ARIA, or text extraction misses what is visibly on the page.

## Core Idea

- Add a generic browser-agent visual snapshot capability that captures a bounded screenshot of the current page state.
- Default visual snapshots to the current viewport, allow region-bounded captures when a relevant area is known, and reserve full-page screenshots for source-debug cases where viewport evidence is insufficient.
- Put the generic screenshot capture primitive in `browser-runtime`; keep trigger policy, tool usage, and interpretation in `browser-agent`.
- Invoke vision analysis only on generic weak signals: zero-yield pages with visible content, suspected modal or login walls, unclear filter/search controls, uncertain job-card extraction, or apply-path ambiguity.
- Allow source-debug to request visual snapshots by default on weak signals, while normal discovery uses stricter triggers only when the run would otherwise produce poor results or recovery guidance.
- Permit every source-debug phase to request visual snapshots, but only when phase-relevant weak signals need visible evidence to explain a blocker, validate completion, or improve source-generic instructions.
- Normalize the vision result into source-generic findings and existing evidence/debug structures.
- Limit omni output to structured observations such as blockers, visible controls, visible job-card clues, apply-path clues, confidence, uncertainty, and suggested investigation notes.
- Use Pro or deterministic normalization before visual observations become durable source-debug phase findings, learned instructions, or persisted summaries; normal discovery can consume validated omni observations as temporary recovery context.
- Persist source-debug screenshots when they explain phase outcomes, blockers, or learned instructions; keep normal-discovery screenshots temporary by default and persist only structured findings unless explicit debug/benchmark retention is enabled.

## Guardrails

- Keep workflow policy source-generic; do not add board-specific visual rules in `job-finder`.
- Keep `job-finder` as the consumer of normalized findings/evidence refs, not the owner of screenshot capture or visual trigger policy.
- Store screenshots only through typed evidence refs with explicit retention/redaction decisions.
- Apply stricter retention/redaction scrutiny to full-page screenshots than viewport or region-bounded snapshots.
- Do not persist normal-discovery screenshots by default.
- Use vision findings as evidence for source-debug and recovery, not as untyped browser actions.
- Do not let vision output direct browser actions, selectors, board-specific routing rules, or saved jobs.

## Open Details

- Define the `browser-runtime` screenshot capture primitive and the `browser-agent` tool/policy wrapper around it.
- Define the structured vision output shape for blockers, visible job cards, controls, and apply-path clues.
- Define validation that rejects direct action commands, selectors, and board-specific workflow rules in visual output.
- Define when Pro normalization is required before visual observations become durable source-debug or source-intelligence language.
- Define phase-relevant weak signals for search entry, search results, job detail validation, apply path validation, and replay verification.
- Define stricter normal-discovery triggers separately from source-debug triggers.
- Define retention rules separately for source-debug evidence, normal discovery, and debug/benchmark modes.
- Define viewport, region-bounded, and full-page capture modes plus when each mode is allowed.
