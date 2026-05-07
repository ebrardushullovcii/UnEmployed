# 034 Browser Source-Debug Visual Evidence

Status: completed

## Completion Summary

- Added schema-validated browser visual contracts for snapshot requests/refs, retention/redaction policy, observations, reconciliations, evidence summaries, and source-debug visual findings.
- Added contract guardrails that reject visual output containing selectors, browser-action directives, saved-job directives, generated-answer/final-submit guidance, or site-specific workflow rules before it can become durable evidence.
- Added a generic `browser-runtime` screenshot primitive with viewport, region, and full-page capture support; retained/debug screenshots write metadata and best-effort cleanup removes expired or over-cap artifacts.
- Added `browser-agent` visual snapshot tooling and source-debug weak-signal policy so phase runs can capture bounded visual evidence when DOM/ARIA/text evidence is weak, while normal discovery remains temporary and stricter by default.
- Added browser visual analysis provider support in `ai-providers`, including OpenAI-compatible Omni configuration and deterministic fallback normalization into safe observation sets.
- Persisted visual source-debug evidence through typed evidence refs, phase evidence, worker attempts, debug findings, source-instruction evidence summaries, and workspace snapshots without moving workflow policy into `job-finder`.

## Latest Evidence

- `pnpm verify:affected`
- Focused reruns: `pnpm --filter @unemployed/contracts test -- source-debug-contracts.test.ts base-contracts.test.ts`, `pnpm --filter @unemployed/browser-runtime test -- playwright-browser-runtime.test.ts`, `pnpm --filter @unemployed/job-finder test -- workspace-service.core.test.ts`
- Static review found privacy/guard/retention risks; fixes landed for explicit apply visual opt-in, stricter unsafe-text rejection, and retained screenshot metadata cleanup before the final affected verification.

## Remaining Limitations

- Live public-site/provider visual comparisons were not run in this pass because reliable credentials and external service state are not guaranteed in local validation.
- Full-page screenshots remain allowed only for source-debug or explicit debug/benchmark evidence and should stay rare because they can contain sensitive page state.
- Normal discovery screenshots remain temporary by default; persisted source-debug screenshots require typed evidence refs with storage path, retention, and redaction metadata.

## Goal

- Use Omni vision to improve browser discovery and source-debug reliability when DOM, ARIA, or text extraction misses what is visibly on the page.

## Guardrails Preserved

- `browser-runtime` owns only generic screenshot capture and retention cleanup.
- `browser-agent` owns trigger policy, tool usage, prompts, and structured visual interpretation.
- `job-finder` consumes normalized source-generic findings and evidence refs; it does not own screenshot capture or board-specific visual rules.
- Vision output is evidence only and cannot direct browser actions, selectors, saved jobs, generated answers, final submit, or site-specific workflow policy.
