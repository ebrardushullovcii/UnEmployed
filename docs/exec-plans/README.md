# Exec Plans

Exec plans are temporary task detail, not durable project memory.

## Directories

- `active/`: work currently in progress
- `queued/`: work that is ready but not started
- `completed/`: intentionally empty except for `.gitkeep`

## Policy

- Create an exec plan only when canonical docs and package guides are not enough to track the work.
- Keep active and queued plans focused on goal, constraints, blockers, next steps, and latest evidence.
- Move durable decisions into `docs/adr/`.
- Move completed milestone summaries into `docs/HISTORY.md`.
- Remove completed plan files after their durable context has been captured.
