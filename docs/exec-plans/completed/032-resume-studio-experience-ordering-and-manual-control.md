# 032 Resume Studio Experience Ordering And Manual Control

Status: completed

## Completion Summary

- Added shared structured-entry ordering in `@unemployed/job-finder` so draft generation, load/save normalization, patch application, preview, export, approval, and benchmarks all consume the same order source.
- Extended `@unemployed/contracts` with per-draft entry order mode plus typed `move_entry` and `reset_entry_order` patches.
- Added Resume Studio up/down controls, order-mode badges, and reset-to-chronology handling while preserving preview-to-editor targeting.
- Added app-only date-quality guidance for ordering confidence without rendering those warnings into exported resume content.

## Latest Evidence

- `pnpm validate:package contracts`
- `pnpm validate:package job-finder`
- `pnpm validate:package desktop`
- `pnpm --filter @unemployed/desktop ui:resume-workspace`
- `pnpm validate:docs-only`

## Goal

Make structured resume entry ordering deterministic, user-controllable, and preview/export faithful.

Experience entries should default to newest-first chronological order every time a draft is generated, imported, loaded, saved, hidden, shown again, rewritten, or recovered. Users should also be able to intentionally move entries when a specific application needs a different order.

## Problem To Solve

- Work experience can appear out of order in Resume Studio and preview, especially after entries are hidden and later shown again.
- Some entries appear out of newest-first order even when they were never hidden.
- The user has no direct way to move an experience entry up or down when the generated order is technically valid but not the order they want for a specific resume.
- AI rewrite, section rewrite, import normalization, coverage policy, hide/show state, and preview rendering all touch the same structured entries, so ordering must be enforced at the shared draft/service boundary instead of only in the renderer.

## Constraints

- Preserve typed boundaries across `@unemployed/contracts`, `@unemployed/job-finder`, desktop main/preload, and renderer layers.
- Keep preview and export on the same order source so Resume Studio, exported PDFs, and benchmark HTML cannot drift.
- Default work-history order is newest-first chronological, not fit-score order, hidden-state order, AI-output order, or insertion order.
- Manual order is an explicit per-draft user choice; do not mutate the canonical profile order unless a separate profile-order feature is deliberately added.
- Hidden entries must not mutate visible ordering. When shown again, an entry should return to its manual position if manual order exists, otherwise its normalized chronological position.
- AI actions must preserve entry IDs and current order unless the user explicitly asks to reorder or reset chronology.
- Keep app-only ordering warnings out of exported resume content.

## Core Implementation Scope

- Audit the resume draft model, profile record mapping, coverage-policy output, and renderer anchors for every place work-history order can be introduced or changed.
- Add or centralize a shared deterministic sort for experience entries: current roles first, then ended roles by end date descending, then start date descending, with stable tie-breakers for equal or missing dates.
- Normalize date ranges enough for sorting common imported formats such as `Jul 2023 - Present`, `Jan 2022 - Present`, `11/2021 - 07/2023`, `Aug 2019 - Jan 2022`, and empty or partial ranges.
- Put entries with missing or unparseable dates at the bottom by default while surfacing an app-only warning that the date prevents confident ordering.
- Ensure coverage-policy include/hide/compact decisions select visibility and detail level without changing chronological order.
- Ensure draft save/load, patch application, assistant edits, section rewrites, lock/unlock, hide/show, preview recovery, and export all preserve the same entry order.
- Add manual order state only if the existing draft model has no reliable place to store it. If a contract change is needed, add schema validation, migration/defaulting, and package-local tests.

## Resume Studio Controls

- Add visible `Move up` and `Move down` controls for structured experience entries, with disabled states at the top and bottom of the visible/manual list.
- Add a section-level `Sort newest first` or `Reset to chronology` action that clears manual ordering for the section and recomputes deterministic chronological order.
- Show whether the section is using `Chronology` or `Manual order` so users understand why an entry is not newest-first.
- Preserve preview-to-editor targeting after reorder operations; clicking a preview entry should still focus the matching structured editor entry.
- Keep controls keyboard-accessible and usable without drag-and-drop. Drag-and-drop can be added later, but it should not be the only reorder mechanism.
- Allow moving locked entries unless lock currently means positional lock as well as content lock. If content lock only protects AI rewriting, manual user ordering should still be allowed.

## Additional Ordering Features To Include

- Apply the same deterministic/default-plus-manual ordering pattern to Education, Certifications, Projects, and other structured sections where ordering matters.
- Add app-only date-quality warnings for overlapping dates, end dates before start dates, future dates, duplicate current roles, and missing date ranges.
- Add quick actions for `Move to top`, `Move to bottom`, and `Restore entry to chronological position` if the basic up/down controls prove tedious in long histories.
- Add a visible order-change indicator in the unsaved draft state so users know reordering requires saving before export/approval uses it.
- Add an assistant guardrail: when the user asks the assistant to improve copy, it should not reorder entries unless the request explicitly mentions ordering.
- Add an assistant capability for explicit requests like `put this consulting role below the full-time role`, `sort experience newest first`, or `move older unrelated roles to the bottom`.
- Consider a future profile-level canonical order editor only after per-draft ordering is stable; tailored resume order should remain draft-owned by default.

## Acceptance Criteria

- A generated or imported resume with mixed current and past roles always renders work experience newest-first by default.
- Hiding an experience entry and showing it again does not append it to the bottom or otherwise disturb the intended order.
- Manual up/down moves are reflected immediately in the editor and live preview, survive save/load, and are used by export and approval flows after save.
- `Reset to chronology` restores deterministic newest-first order without changing entry content or visibility.
- AI rewrite and section rewrite flows preserve the current order unless explicitly asked to reorder.
- App-only warnings explain missing or ambiguous dates but never appear in exported resume content.
- Preview-to-editor targeting still works after automatic sorting, manual moves, hide/show, and section reset operations.

## Validation Plan

- Add unit tests for date-range normalization and newest-first ordering, including present/current roles, partial dates, missing dates, equal dates, and mixed date formats.
- Add service-level tests for draft patch/save/load ordering through hide/show, lock/unlock, assistant rewrite, coverage-policy decisions, and manual reordering.
- Add renderer tests for move controls, reset-to-chronology, disabled edge states, manual-order indicators, and preview targeting after reorder.
- Extend `ui:resume-workspace` with a fixture that reproduces the out-of-order long-history case and captures the corrected preview/editor state.
- Run `pnpm validate:package contracts` if contracts change.
- Run `pnpm validate:package job-finder` for service and coverage-policy changes.
- Run `pnpm validate:package desktop` for renderer, IPC/preload, and desktop tests.
- Run `pnpm --filter @unemployed/desktop ui:resume-workspace` for replayable visual evidence.
- Run `pnpm validate:docs-only` after updating handoff docs.

## Pickup Addendum

Add this work after the currently completed Resume Studio, coverage-policy, and template-catalog baselines. Start by reproducing the screenshot-backed issue where older `.NET Developer` history can appear before newer `Aug 2019 - Jan 2022` history and where shown-again entries do not return to their chronological slot. The first implementation should fix automatic newest-first ordering and hide/show reinsertion before adding richer manual controls.

Do not solve this only with renderer sorting. The durable order must come from the draft/service path that preview, export, approval, assistant edits, and benchmarks all share.
