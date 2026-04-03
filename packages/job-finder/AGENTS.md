# Job Finder Package

Owns job discovery, drafting, review queue logic, and application orchestration.

## Rules

- Ground generated application outputs in stored profile data.
- Use contracts before widening workflow state.
- Keep browser, storage, and AI concerns injected through adapters.
- Keep `src/index.ts` as a thin public barrel; put new workflow logic in focused internal modules instead of appending to one workspace-service file.

