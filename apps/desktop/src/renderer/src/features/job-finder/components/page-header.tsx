interface PageHeaderProps {
  description: string
  eyebrow: string
  title: string
}

export function PageHeader({ description, eyebrow, title }: PageHeaderProps) {
  return (
    <div className="grid gap-4">
      <p className="text-(length:--text-tiny) uppercase tracking-[0.22em] text-muted-foreground">{eyebrow}</p>
      <div className="grid gap-3">
        <h1 className="max-w-[18ch] font-display text-[clamp(3rem,5vw,4.25rem)] font-semibold tracking-[-0.055em] text-(--headline-primary)">{title}</h1>
        <p className="max-w-[68ch] text-[0.98rem] leading-7 text-foreground-soft">{description}</p>
      </div>
    </div>
  )
}
