# DB

Owns local persistence boundaries and repository contracts.

## Rules

- Keep persistence behind repository interfaces
- Do not leak SQL or storage details into the renderer
- Keep `src/index.ts` limited to repository exports
- Add migrations and storage docs when schema ownership changes
