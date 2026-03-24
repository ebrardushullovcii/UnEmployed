# Desktop App

Owns the Electron shell, preload bridge, and renderer entrypoint.

## Rules

- Keep Electron main, preload, and renderer concerns separate.
- Never expose raw Node or Electron primitives directly to the renderer.
- Shared types and IPC payload shapes come from `@unemployed/contracts`.
- UI changes should preserve room for both `Job Finder` and `Interview Helper`.

## Commands

- `pnpm --filter @unemployed/desktop dev`
- `pnpm --filter @unemployed/desktop build`
- `pnpm --filter @unemployed/desktop typecheck`
- `pnpm --filter @unemployed/desktop lint`
- `pnpm --filter @unemployed/desktop ui:capture`
- `pnpm --filter @unemployed/desktop ui:resume-import`
- `pnpm --filter @unemployed/desktop ui:profile-baseline`

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

All design tokens are defined in `src/renderer/src/styles/globals.css`. Use these CSS custom properties instead of arbitrary Tailwind values:

**Radius:**
- `--radius-field: 0.42rem` - Input/field borders
- `--radius-panel: 0.55rem` - Panel/card borders
- `--radius-badge: 0.32rem` - Badge borders
- `--radius-button: 0.8rem` - Button borders
- `--radius-chip: 0.22rem` - Chip/tag borders

**Typography Size:**
- `--text-field: 0.92rem` - Field/input text
- `--text-body: 0.95rem` - Body text
- `--text-description: 0.84rem` - Description text
- `--text-small: 0.78rem` - Small text
- `--text-tiny: 0.68rem` - Tiny/label text

**Typography Tracking:**
- `--tracking-label: 0.11em` - Labels
- `--tracking-heading: 0.12em` - Headings
- `--tracking-caps: 0.18em` - All-caps text
- `--tracking-badge: 0.14em` - Badges
- `--tracking-mono: 0.16em` - Monospace
- `--tracking-normal: 0.08em` - Normal tracking

**Spacing:**
- `--gap-field: 0.44rem` - Field internal gap
- `--gap-content: 0.9rem` - Content gap
- `--gap-card: 1.2rem` - Card internal gap
- `--gap-section: 1.65rem` - Section gap

**Textarea Heights:**
- `--textarea-compact: 5.6rem`
- `--textarea-default: 6.8rem`
- `--textarea-tall: 7.4rem`

**Colors:**
- `--headline-primary: #fbfaf6` - Primary headlines
- `--headline-secondary: #f8f7f3` - Secondary headlines
- `--text-headline: #f6f2e8` - Headline text color
- `--text-badge: #f4efe4` - Badge text color
- `--button-close-hover: #8a1f17` - Close button hover

```tsx
// ✅ Good - Use CSS custom properties
<div className="rounded-[var(--radius-panel)] text-[var(--text-body)] tracking-[var(--tracking-label)]">

// ❌ Bad - Don't use arbitrary values
<div className="rounded-[0.55rem] text-[0.95rem] tracking-[0.11em]">
```

### Import Paths

Use the `@renderer/` path alias for cross-module imports. Never use deep relative paths.

```tsx
// ✅ Good
import { Button } from '@renderer/components/ui/button'
import { StatusBadge } from '../../components/status-badge'

// ❌ Bad
import { Button } from '../../../components/ui/button'
```

### Component Architecture

**UI Components (`src/renderer/src/components/ui/`):**
- Reusable primitives (Button, Input, Field, Badge, etc.)
- Use `class-variance-authority` (CVA) for variants
- Keep components small and focused
- Export both component and variants function

**Feature Components (`src/renderer/src/features/*/components/`):**
- Feature-specific components
- Can compose UI components
- Keep close to the feature that uses them

**Form Primitives:**
- Use `ProfileInput` and `ProfileTextarea` from `profile-form-primitives.tsx`
- These use consistent styling via exported class names
- Don't duplicate form styling across files

### File Organization

```
src/renderer/src/features/job-finder/
├── components/          # Shared feature components
│   ├── ui/              # Feature-specific UI primitives
│   ├── profile/         # Profile-related components
│   └── *.tsx            # Other components
├── screens/             # Screen-level components
│   ├── profile-screen.tsx
│   ├── discovery/
│   ├── applications/
│   └── ...
├── lib/                 # Utilities and types
│   ├── job-finder-utils.ts
│   ├── job-finder-types.ts
│   └── profile-editor.ts
└── hooks/               # Feature-specific hooks
```

### TypeScript

- No `any` types - use proper type inference or explicit types
- Types come from `@unemployed/contracts` for shared shapes
- Keep type definitions close to where they're used
- Use `readonly` for immutable arrays in props

### Styling Patterns

**Section/Article Pattern:**
```tsx
<section className="rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel)] p-6 grid content-start gap-[var(--gap-card)]">
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div>
      <p className="text-[var(--text-tiny)] uppercase tracking-[var(--tracking-label)] text-foreground-muted">
        Section Label
      </p>
      <p className="text-[var(--text-description)] leading-6 text-foreground-muted">
        Section description text.
      </p>
    </div>
    <Badge variant="section">Badge</Badge>
  </div>
  <article className="rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] p-4">
    {/* Content */}
  </article>
</section>
```

### Accessibility

- Use semantic HTML (`section`, `article`, `nav`, `main`, `header`, `footer`)
- Labels must be properly associated with form controls
- Interactive elements must have proper ARIA attributes
- Use `useId()` for unique form element IDs
- Don't wrap interactive elements in `<label>` - use `htmlFor` instead

### Performance

- Keep component files under 400 lines (pure logic files can be longer)
- Use `useMemo` and `useCallback` appropriately
- Avoid inline object/array creation in render
- Prefer CSS custom properties over inline styles