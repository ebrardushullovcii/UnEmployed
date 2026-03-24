interface SettingsStatProps {
  label: string
  value: string
}

export function SettingsStat({ label, value }: SettingsStatProps) {
  return (
    <div className="grid gap-2 border border-border/30 bg-card px-4 py-4">
      <span className="font-display text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <strong className="font-display text-sm font-semibold uppercase tracking-[0.06em] text-foreground">{value}</strong>
    </div>
  )
}
