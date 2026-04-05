# UnEmployed

Agent-first Electron monorepo for two modules:
- `Job Finder`
- `Interview Helper`

## Fast Start

- Read [docs/README.md](docs/README.md) for the doc map.
- Read [docs/STATUS.md](docs/STATUS.md), [docs/TRACKS.md](docs/TRACKS.md), and any linked active or queued exec plan before non-trivial work.
- Read the nearest package-local `AGENTS.md` before changing code in that area.
- Read only the docs relevant to the task; do not re-scan the repo when the canonical docs already answer it.

## Canonical Sources

- [docs/README.md](docs/README.md): documentation entrypoint and reading order
- [docs/STATUS.md](docs/STATUS.md) and [docs/TRACKS.md](docs/TRACKS.md): current handoff state
- `docs/exec-plans/active/` and `docs/exec-plans/queued/`: task-scoped implementation detail and prepared follow-on plans
- [docs/PLAN.md](docs/PLAN.md) and [docs/HISTORY.md](docs/HISTORY.md): durable direction and completed background
- [docs/PRODUCT.md](docs/PRODUCT.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/CONTRACTS.md](docs/CONTRACTS.md), [docs/TESTING.md](docs/TESTING.md), and [docs/AGENT_CONTEXT.md](docs/AGENT_CONTEXT.md): on-demand references for scope, boundaries, verification, and repo-guidance work
- [.agents/registry.yaml](.agents/registry.yaml): machine-readable map for docs, guides, and adapters

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
- When fixing PR or review feedback, prefer the smallest repo-wide or pattern-level correction that removes the whole class of issue instead of only patching the single commented line.
- Update `docs/PRODUCT.md` or module docs for user-facing behavior and scope changes.
- Update `docs/ARCHITECTURE.md` for package boundaries, data flow, or ownership changes.
- Update `docs/CONTRACTS.md` when schemas, DTOs, preload APIs, or adapter payloads change.
- Update `docs/TESTING.md` when required checks, harnesses, or live QA workflows change.
- Update `docs/STATUS.md`, `docs/TRACKS.md`, and the relevant exec plan when preparing work for handoff, commit, or PR review, and move stale exec plans from `active` to `completed` once they stop driving current work.

## Verification

- [docs/TESTING.md](docs/TESTING.md) is the source of truth for repo checks and UI QA workflows.
- Use `pnpm verify` as the broad default check when the task does not call for narrower validation.
- After shared guidance changes, run `pnpm agents:sync`, `pnpm agents:check`, and `pnpm docs:check`.

## Git And PR Workflow

- Never create a git commit unless the user explicitly asks for a commit.
- Never create, update, or comment on a PR unless the user explicitly asks for that action.
- Treat `main` as PR-only; do not plan or rely on direct pushes to `main`.
- Only `@ebrardushullovcii` and `@vigani1` should retain merge authority for `main`.
- Treat CodeRabbit as required repo feedback on every PR, but not as a hard merge gate for those two maintainers.
- Treat documentation updates as part of the same deliverable, not optional follow-up.

## Agent Assets

- `.agents/skills/` is the canonical project-local skill directory.
- `.agents/registry.yaml` is the machine-readable source for canonical docs, required package guides, and generated adapters.
- `.claude/skills` is a generated compatibility symlink created by `pnpm agents:sync`.
- `CLAUDE.md` and `.cursor/rules/00-project.mdc` are generated adapters; do not hand-edit them.
- After updating repo-wide guidance, registry entries, or project-local skills, run `pnpm agents:sync`.
