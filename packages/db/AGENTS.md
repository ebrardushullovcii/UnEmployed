# DB

Owns local persistence boundaries and repository contracts.

## Rules

- Keep persistence details behind repository interfaces.
- Do not leak SQL or storage concerns into the renderer.
- Add migrations and storage docs when schema ownership becomes real.
- Keep `src/index.ts` limited to repository exports; place migrations, legacy import, and repository implementations in focused internal modules.

