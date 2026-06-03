# Goals

Use this for durable product direction. Use `docs/STATUS.md` and `docs/TRACKS.md` only for active state.

## End State

Build one local-first Electron desktop app for job search, resume preparation, safe application assistance, and interview prep/live support.

## Product Shape

- `Job Finder`: profile, resume import, discovery, source-debug, resume workspace, applications, and safe non-submitting apply.
- `Interview Helper`: planned interview prep and live support, outside the current mainline baseline until explicitly merged.
- Shared platform: local profile, document memory, application history, browser runtime, AI provider roles, desktop shell, tray, hotkeys, and settings.

## Durable Priorities

- Local-first persistence is the source of truth.
- Workflows are UI-first with agent acceleration, not chat-only.
- Browser-driven job workflows are a first-class product surface.
- Typed contracts and package boundaries matter more than convenient imports.
- Shared data should be reused instead of rebuilt per workflow.
- Live submit remains disabled until explicitly re-authorized.
- Future interview capture and model use must stay explicit, visible, adapter-owned, and auditable when that workflow lands.

## Delivery Shape

- Foundations and Job Finder baseline are landed.
- Interview Helper live-session work remains outside the mainline baseline until explicitly merged.
- Future work should be concrete hardening, source-generic discovery improvements, or specific regressions.
