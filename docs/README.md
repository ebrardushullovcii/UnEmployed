# Documentation

Start here, then read only the docs needed for the task.

## Task Routing

| Task                                                          | Read                                                                    |
| ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| typo, small local fix, or command output                      | nearest package `AGENTS.md` if editing there                            |
| active feature work or unclear state                          | `docs/STATUS.md`, `docs/TRACKS.md`, relevant active or queued exec plan |
| handoff/status update                                         | `docs/STATUS.md`, `docs/TRACKS.md`, relevant active or queued exec plan |
| durable product direction                                     | `docs/GOALS.md`, `docs/PRODUCT.md`                                      |
| product behavior                                              | `docs/PRODUCT.md`                                                       |
| architecture, package ownership, discovery/source-debug       | `docs/ARCHITECTURE.md`                                                  |
| contracts, schemas, preload APIs, IPC                         | `docs/CONTRACTS.md`                                                     |
| tests, harnesses, validation choice                           | `docs/TESTING.md`                                                       |
| AI model, Responses API, or local Codex bridge setup          | `docs/AI_PROVIDER_SETUP.md`                                             |
| decisions and rationale                                       | `docs/adr/README.md`, then the linked ADR                               |
| domain language                                               | `CONTEXT.md`                                                            |
| repo guidance, adapters, project skills, package guide policy | `docs/AGENT_CONTEXT.md`, `.agents/registry.yaml`                        |
| module-level behavior                                         | `docs/modules/JOB_FINDER.md` or `docs/modules/INTERVIEW_HELPER.md`      |

Read `docs/ARCHITECTURE.md` before changing discovery or source-debug behavior.

## Current Work

- `docs/STATUS.md`: current truth, only when current state matters
- `docs/TRACKS.md`: active work and ready follow-ups
- `docs/exec-plans/active/`: detailed active plans
- `docs/exec-plans/queued/`: detailed ready plans

The active implementation plan is
`docs/exec-plans/active/job-finder-campaigns-dashboard-crm-scale.md`. The
campaign/dashboard/CRM phase-two behavior is implemented and has passed the
focused checks plus the hardened production-Electron harness. The broad
repository gate remains unpassed because the single attempt stopped before
repository scripts ran when Corepack could not verify/fetch the pinned pnpm
10.8 package; the exact state is recorded in `docs/STATUS.md` and
`docs/TRACKS.md`. The
completed AI capability reliability work is recorded in `docs/HISTORY.md`, the
model-routing ADRs, and
`docs/audits/LUNA_HIGH_AND_PRODUCTION_ACCEPTANCE_2026-08-12.html`. The approved
Candidate Asset lifecycle and résumé visual/export refinement remain integrated.

The completed configured-model comparison is recorded in
`docs/audits/AI_MODEL_CAPABILITY_BENCHMARK_FULL_2026-08-12.html`; scoped provider
and browser-integration follow-ups are listed in `docs/TRACKS.md`.

Current Job Finder product audit checklist: `docs/audits/JOB_FINDER_PRODUCT_DECISIONS_AND_AUDIT_CHECKLIST.md`.

Current product quality and performance roadmap: `docs/audits/PRODUCT_QUALITY_PERFORMANCE_ROADMAP.html`.

Current living release audit: `docs/audits/PRODUCT_QUALITY_RELEASE_AUDIT.md`.

## Durable Docs

- `docs/GOALS.md`: durable product direction
- `docs/PRODUCT.md`: product scope and module behavior
- `docs/ARCHITECTURE.md`: package boundaries and data flow
- `docs/CONTRACTS.md`: schema, DTO, preload, and IPC semantics
- `docs/TESTING.md`: validation and harness choices
- `CONTEXT.md`: project vocabulary
- `docs/HISTORY.md`: compact completed milestones
- `docs/adr/`: decisions and rejected alternatives

## Module Docs

- `docs/modules/JOB_FINDER.md`
- `docs/modules/INTERVIEW_HELPER.md`
