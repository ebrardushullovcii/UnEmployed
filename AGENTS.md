# UnEmployed

Agent-first Electron monorepo for `Job Finder` and `Interview Helper`.

## Startup

1. Read `docs/README.md`
2. Read `docs/STATUS.md` and `docs/TRACKS.md` only for active feature work, broad repo changes, handoff updates, or unclear current state
3. Read an active or queued exec plan only if the task is scoped by it
4. Read the nearest package `AGENTS.md` only when editing or reviewing that package

## Rules

- Prefer the smallest relevant doc set; do not rescan the repo when canonical docs already answer the question
- Keep package boundaries typed and schema-validated
- Do not introduce `any`, deep cross-package imports, or untyped IPC
- Follow the source-generic discovery rules in `docs/ARCHITECTURE.md`
- Keep durable knowledge in `docs/`; keep `AGENTS.md` short and pointer-based
- Use `docs/STATUS.md`, `docs/TRACKS.md`, and active or queued exec plans as the handoff layer
- Use `docs/HISTORY.md` and `docs/adr/` for completed context instead of old plan files
- For narrow local tasks, prefer package guides and code over global handoff docs

## Doc Updates

- product behavior: `docs/PRODUCT.md`
- architecture or ownership: `docs/ARCHITECTURE.md`
- contracts, schemas, preload APIs, IPC: `docs/CONTRACTS.md`
- verification flow: `docs/TESTING.md`
- active state: `docs/STATUS.md`, `docs/TRACKS.md`, relevant active or queued exec plan

## Validation

- Default broad check: `pnpm verify`
- Docs or guidance only: `pnpm validate:docs-only`
- Package-local code: `pnpm validate:package <alias>`

## Git Rules

- Never commit unless the user explicitly asks
- Never create or update a PR unless the user explicitly asks
- Treat documentation updates as part of the same deliverable

## Agent Assets

- Repo-specific skills live in `.agents/skills/`
- Registry lives in `.agents/registry.yaml`
- `CLAUDE.md` and `.cursor/rules/00-project.mdc` are generated
