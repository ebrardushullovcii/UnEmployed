interface PageHeaderProps {
  compact?: boolean
  description: string
  eyebrow: string
  title: string
}

export function PageHeader({ compact = false, description, eyebrow, title }: PageHeaderProps) {
  return (
    <div className={compact ? 'grid gap-2' : 'grid gap-4'}>
      <p className="text-(length:--text-tiny) uppercase tracking-[0.22em] text-muted-foreground">{eyebrow}</p>
      <div className={compact ? 'grid gap-1' : 'grid gap-3'}>
        <h1 className={compact
          ? 'max-w-[18ch] font-display text-[clamp(2rem,3.1vw,2.7rem)] font-semibold tracking-[-0.05em] text-(--headline-primary)'
          : 'max-w-[18ch] font-display text-[clamp(3rem,5vw,4.25rem)] font-semibold tracking-[-0.055em] text-(--headline-primary)'}>{title}</h1>
        <p className={compact
          ? 'max-w-[62ch] text-[0.88rem] leading-5 text-foreground-soft'
          : 'max-w-[68ch] text-[0.98rem] leading-7 text-foreground-soft'}>{description}</p>
      </div>
    </div>
  )
}
