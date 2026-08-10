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

No internal feature implementation is currently active, and there are no active
or queued execution plans. The approved Candidate Asset lifecycle and the
resume visual/export refinement are integrated; current release state and
remaining external acceptance are recorded in `docs/STATUS.md` and
`docs/TRACKS.md`.

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
