import { Chip } from '../../../components/ui/chip'
import { FieldLabel } from '../../../components/ui/field'

interface PreferenceListProps {
  compact?: boolean
  label: string
  values: readonly string[]
}

export function PreferenceList({ compact = false, label, values }: PreferenceListProps) {
  return (
    <div className="grid gap-3">
      <FieldLabel>{label}</FieldLabel>
      {values.length > 0 ? (
        <div className={compact ? 'flex flex-wrap gap-1.5' : 'flex flex-wrap gap-2'}>
          {values.map((value) => (
            <Chip key={value}>{value}</Chip>
          ))}
        </div>
      ) : (
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">No values configured.</p>
      )}
    </div>
  )
}
