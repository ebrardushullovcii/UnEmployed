import { useId } from 'react'
import { Switch } from '@renderer/components/ui/switch'
import { cn } from '@renderer/lib/utils'
import { FieldLabel } from '@renderer/components/ui/field'

interface ToggleFieldProps {
  checked: boolean
  className?: string
  description: string
  disabled?: boolean
  hint?: string
  label: string
  onCheckedChange: (checked: boolean) => void
}

export function ToggleField({
  checked,
  className,
  description,
  disabled,
  hint,
  label,
  onCheckedChange
}: ToggleFieldProps) {
  const switchId = useId()
  const descriptionId = useId()

  return (
    <div
      className={cn(
        'surface-card-tint grid min-w-0 content-start gap-(--gap-field) h-full rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-4',
        disabled && 'opacity-50',
        className
      )}
    >
      <FieldLabel htmlFor={switchId}>{label}</FieldLabel>
      <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
        <span id={descriptionId} className="min-w-0 text-(length:--text-small) leading-5 text-muted-foreground">
          <span className="block">{description}</span>
          {hint ? <span className="mt-2 block text-(length:--text-tiny) leading-5 text-muted-foreground">{hint}</span> : null}
        </span>
        <Switch 
          id={switchId}
          checked={checked} 
          disabled={disabled}
          onCheckedChange={onCheckedChange}
          aria-describedby={descriptionId}
        />
      </div>
    </div>
  )
}
