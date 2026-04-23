# Job Finder

## Purpose

Owns profile, resume import, discovery, source-debug, resume workspace, review queue, applications, and apply orchestration.

## Current Baseline

- guided setup and profile copilot are landed
- resume import is reviewable and evidence-backed
- discovery supports configured targets plus source-debug
- resume workspace ships one ATS-first PDF approval path
- apply ships safe non-submitting flows with Applications recovery

## Important Defaults

- profile and resume data are local-first
- source-debug and discovery use typed target instructions
- resume approval is required before apply work
- live submit remains intentionally disabled unless explicitly re-authorized

## Where To Continue

- active work: `docs/exec-plans/active/017-browser-substrate-evaluation-and-direction.md`
- product baseline: `docs/PRODUCT.md`
- package rules: `packages/job-finder/AGENTS.md`
