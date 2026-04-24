# Job Finder

Owns discovery, source-debug, resume workflow, review queue, and apply orchestration.

## Rules

- Ground outputs in stored profile and workspace data
- Widen contracts before widening workflow state
- Keep browser, storage, and AI behind adapters
- Keep discovery orchestration source-generic: no per-board route builders, query maps, triage overrides, or policy branches
- Provider adapters are acceptable for reusable integration surfaces; board-specific workflow policy is not
- Prefer evidence-driven route reuse and generic weak-signal handling
- Keep `src/index.ts` as a thin barrel; put workflow logic in focused internal modules
