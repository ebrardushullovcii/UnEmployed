# UnEmployed

Agent-first Electron monorepo for `Job Finder` and `Interview Helper`.

## Start Here

1. Read `docs/README.md`
2. Read `docs/STATUS.md`
3. Read `docs/TRACKS.md`
4. Read the linked active or queued exec plan if your task touches one
5. Read the nearest package `AGENTS.md`

## Non-Negotiables

- Prefer the smallest relevant doc set; do not rescan the repo when canonical docs already answer the question
- Keep package boundaries typed and schema-validated
- Do not introduce `any`, deep cross-package imports, or untyped IPC
- Follow the source-generic discovery rules in `docs/ARCHITECTURE.md`
- Keep durable knowledge in `docs/`; keep `AGENTS.md` files short
- Treat `docs/STATUS.md`, `docs/TRACKS.md`, and `docs/exec-plans/` as the handoff layer
- When working in desktop, follow `apps/desktop/AGENTS.md`

## Update Docs In The Same Task When You Change

- product behavior: `docs/PRODUCT.md`
- architecture or ownership: `docs/ARCHITECTURE.md`
- contracts, schemas, preload APIs, IPC: `docs/CONTRACTS.md`
- verification flow: `docs/TESTING.md`
- active handoff state: `docs/STATUS.md`, `docs/TRACKS.md`, relevant exec plan

## Validation

- Default broad check: `pnpm verify`
- After shared guidance changes: `pnpm agents:sync`, `pnpm agents:check`, `pnpm docs:check`

## Git Rules

- Never commit unless the user explicitly asks
- Never create or update a PR unless the user explicitly asks
- Treat documentation updates as part of the same deliverable

## Agent Assets

- Skills live in `.agents/skills/`
- Registry lives in `.agents/registry.yaml`
- `CLAUDE.md` and `.cursor/rules/00-project.mdc` are generated; do not hand-edit them
