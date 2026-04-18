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
- Current status: [docs/STATUS.md](docs/STATUS.md)
- Live workboard: [docs/TRACKS.md](docs/TRACKS.md)
- Relevant package-local `AGENTS.md` for the area you are touching, such as [apps/desktop/AGENTS.md](apps/desktop/AGENTS.md) or [packages/job-finder/AGENTS.md](packages/job-finder/AGENTS.md)
- UI design references: [docs/Design/README.md](docs/Design/README.md)

Pull in [docs/PLAN.md](docs/PLAN.md), [docs/AGENT_CONTEXT.md](docs/AGENT_CONTEXT.md), and the architecture or contract docs only when the task needs them.

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
