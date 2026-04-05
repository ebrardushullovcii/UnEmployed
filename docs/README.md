# Documentation

This repo keeps a small set of canonical docs so a new agent can recover context quickly without scanning the entire tree.

## Start Here

1. [STATUS.md](STATUS.md) for the current snapshot
2. [TRACKS.md](TRACKS.md) for the live workboard and next-task registry
3. Linked active or queued exec plan for task-scoped detail
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
- Use `STATUS.md` for now, `TRACKS.md` for ownership and next steps, and exec plans for active or prepared implementation detail.
- Use `AGENT_CONTEXT.md` mainly when changing repo guidance, generated adapters, or the handoff system.
- Use `HISTORY.md` for background, not for active handoff.
- Prefer package-local `AGENTS.md` over repo-wide docs when you are already inside a specific workspace.

## Modules

- [modules/JOB_FINDER.md](modules/JOB_FINDER.md)
- [modules/INTERVIEW_HELPER.md](modules/INTERVIEW_HELPER.md)

## Execution Plans

- Active plans live in `docs/exec-plans/active/` and should represent work that is still driving implementation.
- Queued plans live in `docs/exec-plans/queued/` and should represent prepared follow-on work that is not started yet.
- Completed plans live in `docs/exec-plans/completed/` for historical context or reusable handoff detail.
- Completed repo-foundation baseline: [exec-plans/completed/001-repo-foundation.md](exec-plans/completed/001-repo-foundation.md)
- Historical Job Finder foundation plan: [exec-plans/completed/002-job-finder-browser-apply.md](exec-plans/completed/002-job-finder-browser-apply.md)
- Completed profile-information-architecture background: [exec-plans/completed/003-job-finder-profile-information-architecture.md](exec-plans/completed/003-job-finder-profile-information-architecture.md)
- Completed generic-discovery background: [exec-plans/completed/004-job-finder-generic-discovery.md](exec-plans/completed/004-job-finder-generic-discovery.md)
- Completed source-debug background: [exec-plans/completed/005-job-source-debug-agent.md](exec-plans/completed/005-job-source-debug-agent.md)
- Primary active Job Finder resume plan: [exec-plans/active/007-job-finder-resume-workspace.md](exec-plans/active/007-job-finder-resume-workspace.md)
- Next queued Job Finder automatic apply plan: [exec-plans/queued/008-job-finder-automatic-job-apply.md](exec-plans/queued/008-job-finder-automatic-job-apply.md)
- Queued full-app copy pass: [exec-plans/queued/009-full-app-production-copy-pass.md](exec-plans/queued/009-full-app-production-copy-pass.md)
- Active browser efficiency and speed plan: [exec-plans/active/010-job-finder-browser-efficiency-and-speed.md](exec-plans/active/010-job-finder-browser-efficiency-and-speed.md)

## Design References

- Current Job Finder design references live in [Design/README.md](Design/README.md)

## Durable Decisions

- [decisions/ADR-0001-monorepo-electron.md](decisions/ADR-0001-monorepo-electron.md)
- [decisions/ADR-0002-agent-doc-system.md](decisions/ADR-0002-agent-doc-system.md)
