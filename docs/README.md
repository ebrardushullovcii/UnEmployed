# Documentation

This repo keeps a small set of canonical docs so a new agent can recover context quickly without scanning the entire tree.

## Start Here

1. [STATUS.md](STATUS.md) for the current snapshot
2. [TRACKS.md](TRACKS.md) for the live workboard and next-task registry
3. Linked active exec plan in `docs/exec-plans/active/` for task-scoped detail
4. Relevant package-local `AGENTS.md` for area-specific rules

## Canonical Docs

- [PLAN.md](PLAN.md): durable big-picture plan and rollout shape
- [PRODUCT.md](PRODUCT.md): product shape and module intent
- [AGENT_CONTEXT.md](AGENT_CONTEXT.md): agent layout, generated-adapter policy, and handoff conventions
- [ARCHITECTURE.md](ARCHITECTURE.md): workspace boundaries and data flow
- [CONTRACTS.md](CONTRACTS.md): shared schemas, adapters, and IPC rules
- [TESTING.md](TESTING.md): required checks and validation harnesses
- [HISTORY.md](HISTORY.md): condensed repo milestones and notable completed changes

## Reading Strategy

- Start with the smallest relevant doc set for the task.
- Use `STATUS.md` for now, `TRACKS.md` for ownership and next steps, and exec plans for active implementation detail.
- Use `HISTORY.md` for background, not for active handoff.
- Prefer package-local `AGENTS.md` over repo-wide docs when you are already inside a specific workspace.

## Modules

- [modules/JOB_FINDER.md](modules/JOB_FINDER.md)
- [modules/INTERVIEW_HELPER.md](modules/INTERVIEW_HELPER.md)

## Execution Plans

- Active plans live in `docs/exec-plans/active/`
- Completed plans live in `docs/exec-plans/completed/`
- Current completed baseline: [exec-plans/completed/001-repo-foundation.md](exec-plans/completed/001-repo-foundation.md)

## Design References

- Current Job Finder design references live in [Design/README.md](Design/README.md)

## Durable Decisions

- [decisions/ADR-0001-monorepo-electron.md](decisions/ADR-0001-monorepo-electron.md)
- [decisions/ADR-0002-agent-doc-system.md](decisions/ADR-0002-agent-doc-system.md)
