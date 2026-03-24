import { useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import { FieldLabel } from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/cn'
import { profileInputClassName } from './profile-form-primitives'

interface ProfileListEditorProps {
  className?: string
  displayMode?: 'chips' | 'rows'
  emptyMessage?: string
  label: string
  onChange: (values: string[]) => void
  placeholder: string
  values: readonly string[]
}

function formatCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'item' : 'items'}`
}

export function ProfileListEditor({
  className,
  displayMode = 'chips',
  emptyMessage = 'No items added yet.',
  label,
  onChange,
  placeholder,
  values
}: ProfileListEditorProps) {
  const [draft, setDraft] = useState('')

  const addValue = () => {
    const trimmed = draft.trim()

    if (!trimmed) {
      return
    }

    const nextValues = [...new Set([...values, trimmed])]

    if (nextValues.length !== values.length) {
      onChange(nextValues)
    }

    setDraft('')
  }

  return (
    <div
      className={cn(
        'grid min-w-0 gap-3 rounded-[var(--radius-panel)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] p-4',
        className
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <FieldLabel className="text-[var(--text-tiny)] tracking-[var(--tracking-label)] text-foreground-muted">{label}</FieldLabel>
        <span className="text-[0.72rem] uppercase tracking-[var(--tracking-label)] text-foreground-muted">{formatCountLabel(values.length)}</span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-3">
        <Input
          className={profileInputClassName}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addValue()
            }
          }}
          placeholder={placeholder}
          value={draft}
        />
        <Button
          className="h-11 w-full px-0"
          disabled={!draft.trim()}
          onClick={addValue}
          type="button"
          variant="secondary"
        >
          Add
        </Button>
      </div>

      {values.length > 0 ? (
        <div
          className={cn(
              'rounded-[var(--radius-field)] border border-[var(--field-border)] bg-[rgba(0,0,0,0.24)] p-3',
            displayMode === 'chips'
              ? 'flex max-h-[8.6rem] min-h-[8.6rem] flex-wrap content-start items-start gap-2 overflow-auto'
              : 'grid max-h-[11.5rem] min-h-[11.5rem] content-start gap-2 overflow-auto'
          )}
        >
          {values.map((value) => (
            displayMode === 'chips' ? (
              <div
                key={`${label}_${value}`}
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-border/60 bg-[rgba(255,255,255,0.05)] px-3 py-2 text-[0.9rem] text-foreground-soft"
                title={value}
              >
                <span className="truncate whitespace-nowrap">{value}</span>
                <button
                  aria-label={`Remove ${value}`}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[0.8rem] leading-none text-muted-foreground transition-colors hover:bg-[var(--surface-panel)] hover:text-foreground"
                  onClick={() => onChange(values.filter((entry) => entry !== value))}
                  type="button"
                >
                  x
                </button>
              </div>
            ) : (
              <div
                key={`${label}_${value}`}
                className="grid gap-2 rounded-[var(--radius-field)] border border-border/60 bg-[var(--field)] px-3 py-2.5 text-[0.9rem] leading-6 text-foreground-soft"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 whitespace-pre-wrap break-words">{value}</span>
                  <button
                    aria-label={`Remove ${value}`}
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.8rem] leading-none text-muted-foreground transition-colors hover:bg-[var(--surface-panel)] hover:text-foreground"
                    onClick={() => onChange(values.filter((entry) => entry !== value))}
                    type="button"
                  >
                    x
                  </button>
                </div>
              </div>
            )
          ))}
        </div>
      ) : (
        <p className="text-[var(--text-description)] leading-6 text-foreground-muted">{emptyMessage}</p>
      )}
    </div>
  )
}
