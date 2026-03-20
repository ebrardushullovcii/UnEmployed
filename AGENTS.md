# UnEmployed

Agent-first Electron monorepo for two modules:
- `Job Finder`
- `Interview Helper`

## Canonical Sources

- Start with [docs/README.md](docs/README.md).
- Full project plan lives in [docs/PLAN.md](docs/PLAN.md).
- Agent context layout lives in [docs/AGENT_CONTEXT.md](docs/AGENT_CONTEXT.md).
- Current work and next steps live in [docs/STATUS.md](docs/STATUS.md).
- Live task and handoff tracking lives in [docs/TRACKS.md](docs/TRACKS.md).
- System boundaries live in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Shared contracts live in [docs/CONTRACTS.md](docs/CONTRACTS.md).
- Testing and validation rules live in [docs/TESTING.md](docs/TESTING.md).
- Canonical agent registry lives in [.agents/registry.yaml](.agents/registry.yaml).

## Repo Rules

- Prefer package-local `AGENTS.md` files when working inside a package.
- Keep all external boundaries typed and schema-validated.
- Do not introduce `any`, deep cross-package imports, or untyped IPC.
- If code changes affect behavior, contracts, architecture, or workflows, update the relevant docs in the same task.
- Treat `docs/STATUS.md`, `docs/TRACKS.md`, and `docs/exec-plans/` as the handoff layer for the next agent.

## Git And Doc Workflow

- Never create a git commit unless the user explicitly asks for a commit.
- Never create, update, or comment on a PR unless the user explicitly asks for that action.
- If work is being prepared for a commit, PR, or PR update, agents must proactively update the relevant docs without waiting to be told.
- At minimum, that means updating `docs/STATUS.md`, any affected module or architecture docs, and the active or completed exec plan when the change materially affects project behavior, contracts, structure, or roadmap clarity.
- Treat documentation updates as part of the same deliverable, not as optional follow-up.

## Commands

- `pnpm dev`
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
- `.claude/skills` is a compatibility symlink created by `pnpm agents:sync`.
- `CLAUDE.md` and `.cursor/rules/00-project.mdc` are generated adapters for other agent tools.
- After updating repo-wide guidance, registry entries, or project-local skills, run `pnpm agents:sync`.

## Repo-Owned Skills

- `.agents/skills/repo-governance`: use for repo-wide docs, structure, and adapter changes

## Installed Stack Skills

- `.agents/skills/electron`: Electron-focused implementation guidance
- `.agents/skills/vercel-react-best-practices`: React implementation and performance guidance
- `.agents/skills/typescript-advanced-types`: strict TypeScript and advanced typing patterns
- `.agents/skills/zod`: schema and validation patterns
- `.agents/skills/vitest`: Vitest testing patterns
- `.agents/skills/sqlite-database-expert`: SQLite design and query guidance
- `.agents/skills/playwright-best-practices`: Playwright testing and automation guidance
- `.agents/skills/frontend-design`: frontend design and polished UI exploration guidance
- `.agents/skills/context-driven-development`: context and handoff workflow guidance
- `.agents/skills/architecture-decision-records`: ADR writing and maintenance guidance
