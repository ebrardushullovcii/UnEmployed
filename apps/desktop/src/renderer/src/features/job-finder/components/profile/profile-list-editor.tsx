import { useId, useState } from 'react'
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
  const inputId = useId()
  const [draft, setDraft] = useState('')

  const updateValues = (nextValues: readonly string[]) => {
    const normalizedCurrentValues = [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    const normalizedNextValues = [...new Set(nextValues.map((value) => value.trim()).filter(Boolean))]
    const isUnchanged =
      normalizedCurrentValues.length === normalizedNextValues.length &&
      normalizedCurrentValues.every((value, index) => value === normalizedNextValues[index])

    if (!isUnchanged) {
      onChange(normalizedNextValues)
    }
  }

  const addValue = () => {
    const trimmed = draft.trim()

    if (!trimmed) {
      return
    }

    updateValues([...values, trimmed])

    setDraft('')
  }

  return (
    <section
      className={cn(
        'grid min-w-0 gap-3 rounded-[var(--radius-field)] border border-[var(--field-border)] bg-[var(--field)] p-4',
        className
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <FieldLabel className="text-[var(--text-tiny)] font-medium tracking-[var(--tracking-label)] text-foreground-muted" htmlFor={inputId}>{label}</FieldLabel>
        <span className="text-[0.72rem] uppercase tracking-[var(--tracking-label)] text-foreground-muted">{formatCountLabel(values.length)}</span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-3">
        <Input
          className={profileInputClassName}
          id={inputId}
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
              'rounded-[var(--radius-field)] border border-border/70 bg-[var(--surface-overlay-list)] p-3',
            displayMode === 'chips'
              ? 'flex max-h-[8.6rem] min-h-[8.6rem] flex-wrap content-start items-start gap-2 overflow-auto'
              : 'grid max-h-[11.5rem] min-h-[11.5rem] content-start gap-2 overflow-auto'
          )}
        >
          {values.map((value) => (
            displayMode === 'chips' ? (
              <div
                key={`${label}_${value}`}
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-[color:var(--border)] bg-[var(--surface-fill-chip)] px-3 py-2 text-[0.9rem] text-foreground-soft"
                title={value}
              >
                <span className="truncate whitespace-nowrap">{value}</span>
                <button
                  aria-label={`Remove ${value}`}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[0.8rem] leading-none text-muted-foreground transition-colors hover:bg-[var(--surface-panel)] hover:text-foreground"
                  onClick={() => updateValues(values.filter((entry) => entry !== value))}
                  type="button"
                >
                  x
                </button>
              </div>
            ) : (
              <div
                key={`${label}_${value}`}
                className="grid gap-2 rounded-[var(--radius-field)] border border-border/60 bg-[var(--surface-fill-soft)] px-3 py-2.5 text-[0.9rem] leading-6 text-foreground-soft"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 whitespace-pre-wrap break-words">{value}</span>
                  <button
                    aria-label={`Remove ${value}`}
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.8rem] leading-none text-muted-foreground transition-colors hover:bg-[var(--surface-panel)] hover:text-foreground"
                    onClick={() => updateValues(values.filter((entry) => entry !== value))}
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
    </section>
  )
}
