# Job Finder

Owns discovery, source-debug, resume workflow, review queue, and apply orchestration.

## Rules

- Ground outputs in stored profile and workspace data
- Widen contracts before widening workflow state
- Keep browser, storage, and AI behind adapters
- Keep discovery orchestration source-generic; do not add per-board route builders, query maps, title-triage overrides, or policy branches in shared flow
- Standard provider adapters are acceptable when they represent reusable integration surfaces such as public ATS APIs; board-specific workflow policy is not
- Prefer evidence-driven route reuse and generic weak-signal handling over source-specific rescue logic
- Keep `src/index.ts` as a thin barrel; put workflow logic in focused internal modules
