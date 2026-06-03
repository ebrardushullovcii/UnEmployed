# Tracks

Read this for active work and ready follow-ups. Read `docs/STATUS.md` first when current state matters.

## Status Keys

- `in_progress`: active work
- `ready`: clear next step
- `done`: completed baseline, summarized in `docs/HISTORY.md`
- `blocked`: waiting on another decision or external condition

## Plan Hygiene

- Keep active and queued plans limited to goal, constraints, current blockers, next steps, and latest evidence.
- Create a plan only for work that needs more than the canonical docs and package guides.
- Move durable decisions into `docs/adr/`; move completed milestones into `docs/HISTORY.md`.
- Do not retain completed implementation plans as durable docs.

## Active

- no active plan right now

## Ready Queue

- Expand Applications recovery and retry tooling when backed by a concrete failing recovery scenario.
- Open new discovery/browser work only for a concrete source-generic improvement, ownership cleanup, or substrate decision.
- Add broader runtime tests for unsupported apply paths, live-browser extraction, and resume import when the touched behavior warrants it.
- Start new Interview Helper work only through an explicit plan or branch.

## Completed Context

- Completed milestones live in `docs/HISTORY.md`.
- Durable trade-offs live in `docs/adr/`.
- Replayable evidence lives in package tests, desktop harness artifacts under `apps/desktop/test-artifacts/ui/`, benchmark reports, and git history.
