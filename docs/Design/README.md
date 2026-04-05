# Design References

This directory holds the current visual references for the first `Job Finder` MVP slice.

## Important Warning

- These design artifacts are guidance for layout, hierarchy, states, and overall workflow feel.
- They are not a feature-complete product blueprint.
- If a control, panel, metric, or status appears in a design, that does not automatically mean it must exist as a real feature.
- Implementation should follow the relevant active or queued exec plan, contracts, product scope, and engineering constraints first.
- When design references and real product scope diverge, treat the design as a directional aid and implement the scoped behavior instead.

## Current Reference Set

- `job-finder-profile/`
- `job-finder-discovery/`
- `job-finder-review-queue/`
- `job-finder-applications/`
- `job-finder-settings/`
- `job-finder-state-login-required/`
- `job-finder-state-discovery-empty/`
- `job-finder-state-review-generation/`
- `job-finder-state-apply-paused/`
- `job-finder-state-submission-success/`
- `tactical-command-design-system/` for optional visual-direction ideas, not literal product voice or hard component rules

## Historical References

- `job-finder-profile/current-branch-baseline-2026-03-23.md` is a branch-era regression note, not an active design brief

## How To Use These Files

- `screenshot.png` is the primary visual reference for implementation work.
- `mockup.html` is a very basic prototype artifact generated during UI exploration that can help with layout inspection, spacing, and rough structure.
- `README.md` files explain design intent and system rules when present.
- Some prototype HTML files may still include third-party CDN, font, or placeholder-image references; treat them as inspection artifacts only.

## Source Of Truth Rules

- Treat screenshots and design notes as the design target.
- Treat `mockup.html` files as low-trust, prototype-only references, not production source code.
- Do not copy prototype HTML directly into the app.
- Do not treat prototype HTML as an example of code quality, component architecture, accessibility coverage, or implementation patterns to follow.
- Do not assume every visible UI element in a mockup maps to a real backend capability, persisted field, or shipped workflow.
- When a screen is implemented in real UI code, the prototype HTML should either be archived or deleted if it stops helping.

## Agent Guidance

- For UI implementation tasks, start with the screenshot and the relevant design notes.
- Use the prototype HTML only when it adds useful detail about structure or spacing.
- Ignore `mockup.html` when it conflicts with the screenshot, the active exec plan, or the real component architecture.
- Ignore design-only embellishments when they imply unsupported features, extra settings, speculative metrics, or workflow branches that are not part of the current slice.
- Assume the prototype HTML is disposable design support material produced by a UI agent, not code intended for reuse.

## Tone And Visual Direction

- `tactical-command-design-system/README.md` is useful for density, hierarchy, contrast, and intentional structure.
- Treat it as an exploratory style reference, not the product source of truth.
- Keep the strong desktop-workspace feel, but avoid over-indexing on military or command-center styling in shipped UI.
