interface PageHeaderProps {
  description: string
  eyebrow: string
  title: string
}

export function PageHeader({ description, eyebrow, title }: PageHeaderProps) {
  return (
    <div className="grid gap-3 border-b border-border/20 pb-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
      <div className="grid gap-2">
        <h1 className="font-display text-[1.9rem] font-bold uppercase tracking-[-0.03em] text-primary">{title}</h1>
        <p className="max-w-[64ch] text-sm leading-7 text-foreground-soft">{description}</p>
      </div>
    </div>
  )
}
