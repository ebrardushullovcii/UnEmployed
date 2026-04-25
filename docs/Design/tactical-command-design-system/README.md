# Tactical Command Design Direction

Use this as visual direction, not literal product voice. For shipped UI, implement against the current desktop shell, renderer tokens, and active product patterns instead of copying prototype styling one-to-one.

## Keep

- high information density when it improves workflow clarity
- strong hierarchy, contrast, and desktop-workspace feel
- surface shifts for grouping instead of shadow-heavy cards
- sharper shapes over generic rounded-dashboard styling

## Avoid

- literal mission-console or military styling in shipped UI
- consumer SaaS whitespace for its own sake
- treating prototype styling as implementation source-of-truth instead of the current product shell, tokens, and component patterns

## Translation Rule

Borrow the density and structure, then translate it into the repo's existing product language: keep compact desktop spacing, strong hierarchy, and grouped surfaces, but use the current neutral palette, border treatment, and shell styling instead of harsh tactical or mission-console visuals.
