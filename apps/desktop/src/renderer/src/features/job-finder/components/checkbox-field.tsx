import { Checkbox } from '@renderer/components/ui/checkbox'
import { cn } from '@renderer/lib/utils'

interface CheckboxFieldProps {
  checked: boolean
  className?: string
  label: string
  onCheckedChange: (checked: boolean) => void
}

export function CheckboxField({ checked, className, label, onCheckedChange }: CheckboxFieldProps) {
  return (
    <label
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-[var(--radius-field)] border border-[var(--surface-panel-border)] bg-[var(--surface-panel-raised)] px-4 py-3 text-[var(--text-field)] normal-case tracking-normal text-foreground-soft',
        className
      )}
    >
      <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
      <span>{label}</span>
    </label>
  )
}
