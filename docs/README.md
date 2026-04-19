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

## Desktop Resume Parser Notes

- Desktop resume import now prefers a bundled parser sidecar when available, but normal `pnpm desktop:dev` and desktop builds remain best-effort so contributors without Python can still run the app.
- Use `pnpm --filter @unemployed/desktop prepare:resume-parser-sidecar` when you explicitly want to build the bundled sidecar for the current host platform.
- If bundled sidecar preparation is skipped or unavailable, the app still runs and falls back to embedded parsing for resume imports.

## Execution Plans

- Active plans live in `docs/exec-plans/active/` and should represent work that is still driving implementation.
- Queued plans live in `docs/exec-plans/queued/` and should represent prepared follow-on work that is not started yet.
- Completed plans live in `docs/exec-plans/completed/` for historical context or reusable handoff detail.
- Completed repo-foundation baseline: [exec-plans/completed/001-repo-foundation.md](exec-plans/completed/001-repo-foundation.md)
- Historical Job Finder foundation plan: [exec-plans/completed/002-job-finder-browser-apply.md](exec-plans/completed/002-job-finder-browser-apply.md)
- Completed profile-information-architecture background: [exec-plans/completed/003-job-finder-profile-information-architecture.md](exec-plans/completed/003-job-finder-profile-information-architecture.md)
- Completed generic-discovery background: [exec-plans/completed/004-job-finder-generic-discovery.md](exec-plans/completed/004-job-finder-generic-discovery.md)
- Completed source-debug background: [exec-plans/completed/005-job-source-debug-agent.md](exec-plans/completed/005-job-source-debug-agent.md)
- Completed Job Finder resume workspace: [exec-plans/completed/007-job-finder-resume-workspace.md](exec-plans/completed/007-job-finder-resume-workspace.md)
- Completed shared data expansion plan: [exec-plans/completed/011-job-finder-shared-data-expansion.md](exec-plans/completed/011-job-finder-shared-data-expansion.md)
- Completed guided setup and profile copilot plan: [exec-plans/completed/012-job-finder-guided-setup-and-profile-copilot.md](exec-plans/completed/012-job-finder-guided-setup-and-profile-copilot.md)
- Completed source intelligence and faster discovery plan: [exec-plans/completed/013-job-finder-source-intelligence-and-faster-discovery.md](exec-plans/completed/013-job-finder-source-intelligence-and-faster-discovery.md)
- Completed 013 companion benchmark report and evidence: [exec-plans/completed/013-benchmark-results.md](exec-plans/completed/013-benchmark-results.md)
- Completed resume output and template quality plan: [exec-plans/completed/014-job-finder-resume-output-and-template-quality.md](exec-plans/completed/014-job-finder-resume-output-and-template-quality.md)
- Queued automatic job apply plan: [exec-plans/queued/015-job-finder-automatic-job-apply.md](exec-plans/queued/015-job-finder-automatic-job-apply.md)
- Queued shared agent auto compaction plan: [exec-plans/queued/016-shared-agent-auto-compaction.md](exec-plans/queued/016-shared-agent-auto-compaction.md)
- Completed full-app copy pass: [exec-plans/completed/009-full-app-production-copy-pass.md](exec-plans/completed/009-full-app-production-copy-pass.md)
- Completed browser efficiency and speed: [exec-plans/completed/010-job-finder-browser-efficiency-and-speed.md](exec-plans/completed/010-job-finder-browser-efficiency-and-speed.md)
- Queued browser substrate evaluation and direction plan: [exec-plans/queued/017-browser-substrate-evaluation-and-direction.md](exec-plans/queued/017-browser-substrate-evaluation-and-direction.md)
- Completed resume import and extraction reliability plan: [exec-plans/completed/018-job-finder-resume-import-and-extraction-reliability.md](exec-plans/completed/018-job-finder-resume-import-and-extraction-reliability.md)
- Completed world-class resume import plan: [exec-plans/completed/019-job-finder-world-class-resume-import.md](exec-plans/completed/019-job-finder-world-class-resume-import.md)

## Design References

- Current Job Finder design references live in [Design/README.md](Design/README.md)

## Durable Decisions

- [decisions/ADR-0001-monorepo-electron.md](decisions/ADR-0001-monorepo-electron.md)
- [decisions/ADR-0002-agent-doc-system.md](decisions/ADR-0002-agent-doc-system.md)
