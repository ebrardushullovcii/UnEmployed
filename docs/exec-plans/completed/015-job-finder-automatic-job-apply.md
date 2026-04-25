# 015 Job Finder Automatic Job Apply

Status: completed

## Goal

Move apply from review-only helpers toward a staged automation model, starting with safe non-submitting execution.

## What Landed

- apply-run, blocker, consent, answer, and replay foundations
- one-job apply copilot that pauses before submit
- safe single-job auto-run staging
- safe queue staging, consent handling, and recovery
- Applications recovery surfaces for older runs and reruns

## Hard Product Rule

- live submit remains intentionally disabled until explicitly re-authorized

## What It Means Now

- this is the safe-apply baseline
- do not reopen live-submit work casually
