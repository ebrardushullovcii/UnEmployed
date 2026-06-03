# UnEmployed

Agent-first desktop monorepo for:
- `Job Finder`
- `Interview Helper`

## Stack

- `pnpm` workspaces
- `turbo`
- `TypeScript`
- `Electron + React`

## Start Here

- Repo contract: [AGENTS.md](AGENTS.md)
- Docs map: [docs/README.md](docs/README.md)
- Durable goals: [docs/GOALS.md](docs/GOALS.md)
- Current state when needed: [docs/STATUS.md](docs/STATUS.md)
- Active workboard when needed: [docs/TRACKS.md](docs/TRACKS.md)
- Decisions: [docs/adr/README.md](docs/adr/README.md)
- Relevant package-local `AGENTS.md` for the area you are touching, such as [apps/desktop/AGENTS.md](apps/desktop/AGENTS.md) or [packages/job-finder/AGENTS.md](packages/job-finder/AGENTS.md)
- UI design references: [docs/Design/README.md](docs/Design/README.md)

Pull in [docs/AGENT_CONTEXT.md](docs/AGENT_CONTEXT.md), architecture docs, contract docs, and active exec plans only when the task needs them.

## Common Commands

```bash
pnpm install
pnpm format:check
pnpm verify:quick
pnpm lsp:typescript
pnpm verify
pnpm knip
pnpm desktop:dev
```

## Guidance Maintenance

```bash
pnpm agents:sync
pnpm agents:check
pnpm docs:check
```
