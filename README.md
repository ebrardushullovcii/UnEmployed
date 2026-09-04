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
- Decisions: [docs/adr/README.md](docs/adr/README.md)
- UI design references: [docs/Design/README.md](docs/Design/README.md)

Pull in architecture, contract, and testing docs only when the task needs them.

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
