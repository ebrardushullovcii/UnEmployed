import type { ResumeTemplateDefinition, ResumeTemplateId } from '@unemployed/contracts'
import { Badge } from '@renderer/components/ui/badge'
import { cn } from '@renderer/lib/utils'

interface ResumeThemePickerProps {
  disabled?: boolean
  id?: string
  selectedThemeId: ResumeTemplateId
  themes: readonly ResumeTemplateDefinition[]
  onChange: (themeId: ResumeTemplateId) => void
}

function getThemePreviewTone(themeId: ResumeTemplateId) {
  switch (themeId) {
    case 'classic_ats':
      return 'from-slate-200/80 via-slate-100/80 to-white'
    case 'compact_exec':
      return 'from-slate-300/80 via-slate-100/70 to-white'
    case 'modern_split':
      return 'from-blue-200/80 via-slate-100/70 to-white'
    case 'technical_matrix':
      return 'from-teal-200/80 via-slate-100/70 to-white'
    case 'project_showcase':
      return 'from-amber-200/80 via-orange-100/70 to-white'
    case 'credentials_focus':
      return 'from-violet-200/80 via-fuchsia-100/70 to-white'
  }
}

function getDensityLabel(density: ResumeTemplateDefinition['density']) {
  switch (density) {
    case 'comfortable':
      return 'Comfortable'
    case 'balanced':
      return 'Balanced'
    case 'compact':
      return 'Compact'
  }
}

export function ResumeThemePicker({
  disabled = false,
  id,
  selectedThemeId,
  themes,
  onChange,
}: ResumeThemePickerProps) {
  return (
    <div
      aria-disabled={disabled || undefined}
      aria-labelledby={id}
      className="grid gap-3"
      role="radiogroup"
    >
      {themes.map((theme) => {
        const selected = theme.id === selectedThemeId

        return (
          <button
            key={theme.id}
            aria-checked={selected}
            className={cn(
              'group grid w-full gap-4 rounded-(--radius-field) border px-4 py-4 text-left transition-[border-color,background-color,box-shadow,transform] outline-none focus-visible:border-primary focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_18%,transparent)] disabled:cursor-not-allowed disabled:opacity-60',
              selected
                ? 'border-primary/45 bg-primary/8 shadow-[inset_0_1px_0_var(--focus-inset-highlight)]'
                : 'border-(--surface-panel-border) bg-(--surface-panel) hover:border-primary/30 hover:bg-(--surface-overlay-subtle)',
            )}
            disabled={disabled}
            onClick={() => onChange(theme.id)}
            role="radio"
            type="button"
          >
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_11rem] md:items-start">
              <div className="grid gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-(length:--text-body) font-semibold text-foreground">
                    {theme.label}
                  </span>
                  <Badge variant={selected ? 'default' : 'section'}>
                    {getDensityLabel(theme.density)}
                  </Badge>
                  {selected ? <Badge variant="default">Selected</Badge> : null}
                </div>
                <p className="text-(length:--text-description) leading-6 text-foreground-soft">
                  {theme.description}
                </p>
                {theme.bestFor.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {theme.bestFor.map((tag) => (
                      <Badge key={`${theme.id}_${tag}`} variant="section">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
              <div
                aria-hidden="true"
                className={cn(
                  'relative min-h-24 overflow-hidden rounded-(--radius-field) border border-border/40 bg-gradient-to-br p-3',
                  getThemePreviewTone(theme.id),
                )}
              >
                <div className="grid h-full gap-2 rounded-[0.9rem] border border-white/70 bg-white/85 p-3 shadow-[0_12px_24px_rgba(15,23,42,0.08)]">
                  <div className="grid gap-1">
                    <div className="h-2.5 w-20 rounded-full bg-slate-800/85" />
                    <div className="h-1.5 w-28 rounded-full bg-slate-400/80" />
                  </div>
                  <div className="grid gap-1.5">
                    <div className="h-1.5 w-full rounded-full bg-slate-300/90" />
                    <div className="h-1.5 w-[82%] rounded-full bg-slate-300/80" />
                    <div className="h-1.5 w-[68%] rounded-full bg-slate-300/70" />
                  </div>
                  <div className="mt-auto flex gap-1.5">
                    <div className="h-5 flex-1 rounded-full border border-slate-300/80 bg-white/90" />
                    <div className="h-5 w-8 rounded-full bg-slate-700/85" />
                  </div>
                </div>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
