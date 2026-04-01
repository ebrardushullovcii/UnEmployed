# Desktop App

Owns the Electron shell, preload bridge, and renderer entrypoint.

## Rules

- Keep Electron main, preload, and renderer concerns separate.
- Never expose raw Node or Electron primitives directly to the renderer.
- Shared types and IPC payload shapes come from `@unemployed/contracts`.
- UI changes should preserve room for both `Job Finder` and `Interview Helper`.
- Keep desktop guidance stable and implementation-facing; point to canonical source files instead of duplicating volatile token values.

## Commands

- `pnpm desktop:dev`
- `pnpm --filter @unemployed/desktop build`
- `pnpm --filter @unemployed/desktop typecheck`
- `pnpm --filter @unemployed/desktop lint`
- `pnpm --filter @unemployed/desktop ui:capture`
- `pnpm --filter @unemployed/desktop ui:resume-import`
- `pnpm --filter @unemployed/desktop ui:profile-baseline`

## Read This Before Editing

- `src/renderer/src/styles/globals.css`: canonical renderer tokens and shared base styles
- `src/renderer/src/app/` and `src/renderer/src/pages/`: route and app entrypoints
- `src/renderer/src/features/`: feature-local components, hooks, and utilities
- `src/main/` and `src/preload/`: Electron main-process and preload boundaries

## UI Review Notes

- `ui:capture` builds the app, launches Electron through Playwright, navigates the seeded Job Finder screens, and saves screenshots under `apps/desktop/test-artifacts/ui/`.
- `ui:resume-import` builds the app, enables a test-only preload bridge, imports a resume from disk without the native file-picker, reloads the workspace, and saves screenshots plus workspace JSON under `apps/desktop/test-artifacts/ui/`.
- `ui:profile-baseline` builds the app, hydrates the current preferred Profile state from a saved workspace snapshot, captures the top-level Job Finder tabs, and records top/full/scroll screenshots for every screen under `apps/desktop/test-artifacts/ui/`.
- Pass `--resume`, `--expected-name`, `--expected-headline`, `--expected-location`, `--expected-summary-contains`, and `--label` to `scripts/capture-resume-import.mjs` when you need targeted validation for a specific file.
- Pass `--snapshot` and `--label` to `scripts/capture-profile-baseline.mjs` when you need to document another imported-profile baseline or save into a new artifact folder.
- The default capture size is `1440x920`; use `UI_CAPTURE_WIDTH`, `UI_CAPTURE_HEIGHT`, and `UI_CAPTURE_LABEL` to run other desktop sizes.
- The capture flow uses a temporary user-data directory so each run starts from a clean seeded workspace.
- The Electron main process auto-loads root or `apps/desktop` `.env` / `.env.local` files before creating the AI client, so `UNEMPLOYED_AI_API_KEY` can live in `.env.local` for local testing.

## Frontend Best Practices

### CSS Custom Properties

- All design tokens live in `src/renderer/src/styles/globals.css`.
- Reuse existing semantic CSS variables and shared utility patterns before adding new token names.
- Prefer shared tokens over one-off raw hex values, arbitrary spacing, or inline styles.
- If a new visual primitive is likely to be reused, add or extend a token in `src/renderer/src/styles/globals.css` instead of hardcoding it in a component.

### Import Paths

Use the `@renderer/` path alias for cross-feature or shared imports. Use short relative imports only inside the same local feature subtree.

```tsx
// ✅ Good
import { Button } from "@renderer/components/ui/button";
import { StatusBadge } from "@renderer/features/job-finder/components/status-badge";
import { profileFieldClassName } from "./profile-form-primitives";

// ❌ Bad
import { Button } from "../../../components/ui/button";
import { StatusBadge } from "../../../../features/job-finder/components/status-badge";
```

### Component Architecture

- Reusable primitives (Button, Input, Field, Badge, etc.)
- Use `class-variance-authority` (CVA) for variants
- Keep components small and focused
- Export both component and variants function
- Feature-specific components
- Can compose UI components
- Keep close to the feature that uses them
- Use `ProfileInput` and `ProfileTextarea` from `profile-form-primitives.tsx`
- These use consistent styling via exported class names
- Don't duplicate form styling across files

### File Organization

- Put shared renderer primitives in `src/renderer/src/components/ui/`.
- Put feature-specific composition in `src/renderer/src/features/<feature>/`.
- Put route-level page shells in `src/renderer/src/pages/` or feature screen folders that already match the routed structure.
- Keep helpers close to the feature that owns them before promoting them to shared UI or shared lib code.

### TypeScript

- No `any` types - use proper type inference or explicit types
- Types come from `@unemployed/contracts` for shared shapes
- Keep type definitions close to where they're used
- Use `readonly` for immutable arrays in props

### Accessibility

- Use semantic HTML (`section`, `article`, `nav`, `main`, `header`, `footer`)
- Labels must be properly associated with form controls
- Interactive elements must have proper ARIA attributes
- Use `useId()` for unique form element IDs
- Don't wrap interactive elements in `<label>` - use `htmlFor` instead

### Review Drift Prevention

- Treat repeated PR feedback as a documentation bug, not just a code bug: when a desktop review issue looks reusable, update this file or the closest canonical doc in the same task.
- Before finishing renderer UI work, do a quick pass for the patterns that have repeated in review: labeled controls need `useId()` + `htmlFor` / `triggerId`, status banners need the right live-region semantics, and active navigation or selection states need ARIA state in addition to visual styling.
- Modal dialogs must trap focus, restore the previously focused element, and make the background inert or `aria-hidden` while open.
- Single-selection controls should use `aria-current` or `aria-selected` instead of `aria-pressed`.
- Use semantic structure for screen sections and collections (`header`, headings, `ul`/`li`, landmark-friendly `section` / `article`) instead of visually styled `div`/`p` wrappers when the content represents named regions or lists.
- Do not leave non-functional interactive affordances exposed as enabled controls; if a button has no action yet, make it passive text or clearly disabled with an accessible label.
- Prefer shared tokens from `src/renderer/src/styles/globals.css` over raw color literals, arbitrary RGBA utilities, or one-off surface treatments when polishing desktop UI.

### Performance

- Keep component files under 400 lines (pure logic files can be longer)
- Use `useMemo` and `useCallback` appropriately
- Avoid inline object/array creation in render
- Prefer CSS custom properties over inline styles
