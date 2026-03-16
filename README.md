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
- Full project plan: [docs/PLAN.md](docs/PLAN.md)
- Agent context layout: [docs/AGENT_CONTEXT.md](docs/AGENT_CONTEXT.md)
- Current status: [docs/STATUS.md](docs/STATUS.md)

## Commands

```bash
pnpm install
pnpm lsp:typescript
pnpm agents:sync
pnpm verify
pnpm --filter @unemployed/desktop dev
```
