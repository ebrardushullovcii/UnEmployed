# 016 Shared Agent Auto Compaction

Status: completed

## Goal

Create one shared compaction baseline for long-running agent workflows.

## What Landed

- shared compaction contracts and snapshot shapes
- token-budget-first browser-agent compaction with fallback behavior
- lightweight compaction telemetry in discovery and source-debug
- reusable handoff seam for later apply workers

## What It Means Now

- this is the compaction baseline
- as implemented, the deterministic apply flow intentionally does not depend on it so apply stays reproducible and avoids hidden compaction side effects in the current safe path
