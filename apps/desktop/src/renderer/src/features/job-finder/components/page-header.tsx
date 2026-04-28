interface PageHeaderProps {
  compact?: boolean
  description: string
  eyebrow: string
  title: string
}

export function PageHeader({ compact = false, description, eyebrow, title }: PageHeaderProps) {
  return (
    <div className={compact ? 'grid gap-2' : 'grid gap-4'}>
      <p className="text-(length:--text-tiny) uppercase tracking-(--tracking-page-eyebrow) text-muted-foreground">{eyebrow}</p>
      <div className={compact ? 'grid gap-1' : 'grid gap-3'}>
        <h1 className={compact
          ? 'max-w-[18ch] font-display text-(length:--text-page-title-compact) font-semibold tracking-(--tracking-page-title-compact) text-(--headline-primary)'
          : 'max-w-[18ch] font-display text-(length:--text-page-title) font-semibold tracking-(--tracking-page-title) text-(--headline-primary)'}>{title}</h1>
        <p className={compact
          ? 'max-w-[62ch] text-(length:--text-page-description-compact) leading-(--leading-page-description-compact) text-foreground-soft'
          : 'max-w-[68ch] text-(length:--text-page-description) leading-(--leading-page-description) text-foreground-soft'}>{description}</p>
      </div>
    </div>
  )
}
