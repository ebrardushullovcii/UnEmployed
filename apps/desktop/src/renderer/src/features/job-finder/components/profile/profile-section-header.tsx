import type { ReactNode } from 'react'

interface ProfileSectionHeaderProps {
  action?: ReactNode
  description?: string
  eyebrow?: string
  title: string
}

export function ProfileSectionHeader({ action, description, eyebrow, title }: ProfileSectionHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="grid gap-1.5">
        {eyebrow ? (
          <p className="text-(length:--text-field-label) font-medium uppercase tracking-(--tracking-label) text-foreground-muted">{eyebrow}</p>
        ) : null}
        <div className="grid gap-1.5">
          <h2 className="text-(length:--text-section-title) font-semibold tracking-[-0.02em] text-(--text-headline)">{title}</h2>
          {description ? (
            <p className="max-w-[62ch] text-(length:--text-description) leading-6 text-foreground-muted">{description}</p>
          ) : null}
        </div>
      </div>

      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  )
}
