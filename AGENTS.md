# UnEmployed

Agent-first Electron monorepo for two modules:
- `Job Finder`
- `Interview Helper`

## Fast Start

- Read [docs/README.md](docs/README.md) for the doc map.
- Read [docs/STATUS.md](docs/STATUS.md) for the current snapshot.
- Read [docs/TRACKS.md](docs/TRACKS.md) and any linked active exec plan before non-trivial work.
- Read the nearest package-local `AGENTS.md` before changing code in that area.
- Read only the docs relevant to the task; do not re-scan the whole repo when the canonical docs already answer it.

## Canonical Sources

- [docs/README.md](docs/README.md): documentation entrypoint and reading order
- [docs/PLAN.md](docs/PLAN.md): durable project plan and rollout shape
- [docs/PRODUCT.md](docs/PRODUCT.md): product shape and module intent
- [docs/STATUS.md](docs/STATUS.md): short current-state snapshot
- [docs/TRACKS.md](docs/TRACKS.md): live workboard and handoff registry
- [docs/HISTORY.md](docs/HISTORY.md): condensed repo milestones and notable changes
- [docs/AGENT_CONTEXT.md](docs/AGENT_CONTEXT.md): agent layout, handoff rules, generated-adapter policy
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): workspace boundaries and data flow
- [docs/CONTRACTS.md](docs/CONTRACTS.md): shared schemas, adapters, and IPC rules
- [docs/TESTING.md](docs/TESTING.md): required checks and validation workflows
- [.agents/registry.yaml](.agents/registry.yaml): machine-readable registry for docs, guides, and adapters

## Repo Rules

- Prefer package-local `AGENTS.md` files when working inside a package.
- Keep external boundaries typed and schema-validated.
- Do not introduce `any`, deep cross-package imports, or untyped IPC.
- Keep durable knowledge in `docs/` and reusable workflows in skills; keep always-on instruction files short.
- Do not duplicate volatile implementation details, long changelogs, or generated content across multiple guidance files.
- Treat `docs/STATUS.md`, `docs/TRACKS.md`, and `docs/exec-plans/` as the handoff layer for the next agent.
- When working on the desktop app, follow `apps/desktop/AGENTS.md`.

## Doc Update Rules

- Update docs in the same task when code changes behavior, contracts, architecture, workflows, or delivery shape.
- When PR or review feedback exposes a repeated mistake, checklist gap, or reusable implementation pattern, update the nearest relevant `AGENTS.md` or canonical doc in the same task so later agents inherit the lesson instead of re-learning it from comments.
- Update `docs/PRODUCT.md` or module docs for user-facing behavior and scope changes.
- Update `docs/ARCHITECTURE.md` for package boundaries, data flow, or ownership changes.
- Update `docs/CONTRACTS.md` when schemas, DTOs, preload APIs, or adapter payloads change.
- Update `docs/TESTING.md` when required checks, harnesses, or live QA workflows change.
- Update `docs/STATUS.md`, `docs/TRACKS.md`, and the relevant exec plan when preparing work for handoff, commit, or PR review.

## Git And PR Workflow

- Never create a git commit unless the user explicitly asks for a commit.
- Never create, update, or comment on a PR unless the user explicitly asks for that action.
- Treat `main` as PR-only; do not plan or rely on direct pushes to `main`.
- Only `@ebrardushullovcii` and `@vigani1` should retain merge authority for `main`.
- Treat CodeRabbit as required repo feedback on every PR, but not as a hard merge gate for those two maintainers.
- Treat documentation updates as part of the same deliverable, not optional follow-up.

## Commands

- `pnpm dev`
- `pnpm desktop:dev`
- `pnpm lint`
- `pnpm lsp:typescript`
- `pnpm typecheck`
- `pnpm test`
- `pnpm agents:sync`
- `pnpm agents:check`
- `pnpm docs:check`
- `pnpm verify`

## Agent Context

- `.agents/skills` is the canonical project-local skill directory.
- `.claude/skills` is a generated compatibility symlink created by `pnpm agents:sync`.
- `CLAUDE.md` and `.cursor/rules/00-project.mdc` are generated adapters; do not hand-edit them.
- After updating repo-wide guidance, registry entries, or project-local skills, run `pnpm agents:sync`.

## Repo-Owned Skills

- `.agents/skills/repo-governance`: repo-wide docs, structure, and adapter changes

## Installed Stack Skills

- `.agents/skills/electron`: Electron implementation guidance
- `.agents/skills/vercel-react-best-practices`: React implementation and performance guidance
- `.agents/skills/react-hook-form`: React Hook Form form patterns and performance guidance
- `.agents/skills/shadcn`: shadcn/ui component architecture, forms, and composition guidance
- `.agents/skills/typescript-advanced-types`: strict TypeScript and advanced typing patterns
- `.agents/skills/zod`: schema and validation patterns
- `.agents/skills/vitest`: Vitest testing patterns
- `.agents/skills/sqlite-database-expert`: SQLite design and query guidance
- `.agents/skills/playwright-best-practices`: Playwright testing and automation guidance
- `.agents/skills/frontend-design`: polished UI exploration guidance
- `.agents/skills/context-driven-development`: context and handoff workflow guidance
- `.agents/skills/architecture-decision-records`: ADR writing and maintenance guidance
