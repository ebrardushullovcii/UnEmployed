import { Checkbox } from '../../../components/ui/checkbox'
import { cn } from '@renderer/lib/utils'

interface CheckboxFieldProps {
  checked: boolean
  className?: string
  label: string
  onCheckedChange: (checked: boolean) => void
}

export function CheckboxField({ checked, className, label, onCheckedChange }: CheckboxFieldProps) {
  return (
    <label className={cn('flex items-start gap-3 border border-border/30 bg-card px-4 py-3 text-[11px] uppercase tracking-[0.08em] text-foreground-soft', className)}>
      <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
      <span>{label}</span>
    </label>
  )
}
