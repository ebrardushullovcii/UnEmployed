import { Switch } from '@renderer/components/ui/switch'
import { cn } from '@renderer/lib/utils'

interface ToggleFieldProps {
  checked: boolean
  className?: string
  description: string
  label: string
  onCheckedChange: (checked: boolean) => void
}

export function ToggleField({
  checked,
  className,
  description,
  label,
  onCheckedChange
}: ToggleFieldProps) {
  return (
    <label
      className={cn(
        'flex items-center justify-between gap-4 border border-border/20 bg-secondary px-4 py-4',
        className
      )}
    >
      <div className="grid gap-1.5">
        <span className="font-display text-[11px] font-bold uppercase tracking-[0.12em] text-foreground">{label}</span>
        <span className="text-[10px] leading-5 text-muted-foreground">{description}</span>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  )
}
