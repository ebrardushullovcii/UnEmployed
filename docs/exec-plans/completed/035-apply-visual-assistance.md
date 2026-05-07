# 035 Apply Visual Assistance

Status: completed

## Completion Summary

- Added typed apply visual checkpoints, observation sets, reconciliations, evidence summaries, question context links, artifact refs, replay checkpoints, recovery context, and workspace snapshot support.
- Added safe apply visual diagnostics that classify visible blockers, field/control hints, validation errors, button states, question context, and recovery notes without granting vision authority over browser actions or answers.
- Changed live-browser apply visual capture to explicit orchestrator opt-in only: `browser-runtime` no longer captures or sends application-page screenshots just because an ambient visual-capable AI client exists.
- Wired `job-finder` to opt into bounded temporary apply checkpoints only from explicit apply-run/action intent (`visualCheckpointsEnabled` defaults false), then persist only schema-validated evidence summaries/checkpoints/artifacts needed for review and retry recovery.
- Added Applications UI review data for visual evidence, checkpoints, reconciliation state, retained evidence, and recovery context, with renderer tests and replayable Applications recovery harness coverage.
- Preserved safe apply behavior: live submit remains disabled, user review/consent gates remain intact, and visual output cannot include click/select/open/submit instructions, selectors, generated answers, final-submit guidance, saved-job directives, or site-specific apply rules.

## Latest Evidence

- `pnpm verify:affected`
- Focused reruns: `pnpm --filter @unemployed/browser-runtime test -- playwright-browser-runtime.test.ts`, `pnpm --filter @unemployed/job-finder test -- workspace-service.core.test.ts`, `pnpm --filter @unemployed/contracts test -- source-debug-contracts.test.ts base-contracts.test.ts`
- Earlier UI/product evidence from this implementation: `pnpm validate:desktop`, `pnpm --filter @unemployed/desktop build`, and `pnpm --filter @unemployed/desktop ui:applications-recovery` with artifacts under `apps/desktop/test-artifacts/ui/applications-recovery/`.

## Remaining Limitations

- Live final submit remains intentionally disabled and was not tested.
- Real employer-portal visual diagnostics were not run against private/login-required portals in this pass; local validation uses deterministic runtime, contracts, and desktop harnesses.
- Apply screenshots are temporary by default; retained evidence is limited to selected checkpoint/recovery metadata and requires explicit retention/redaction decisions.

## Goal

- Use Omni vision to make the existing safe non-submitting apply flow better at understanding visible application forms, upload controls, validation errors, and blockers.

## Guardrails Preserved

- Vision supplements DOM field snapshots and recovery summaries; it does not silently override DOM-derived field state.
- Vision cannot fill fields, generate answers to submit, choose controls, click, select, open, save jobs, or provide final-submit guidance.
- User consent, resume approval, and review gates remain the authority before any application state is considered ready.
