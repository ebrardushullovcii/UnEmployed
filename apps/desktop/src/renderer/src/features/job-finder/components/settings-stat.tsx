interface SettingsStatProps {
  label: string
  value: string
}

export function SettingsStat({ label, value }: SettingsStatProps) {
  return (
    <div className="grid gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel-raised) px-4 py-4">
      <span className="font-display text-[10px] uppercase tracking-(--tracking-caps) text-muted-foreground">{label}</span>
      <strong className="font-display text-(length:--text-body) font-semibold tracking-[-0.01em] text-foreground">{value}</strong>
    </div>
  )
}
