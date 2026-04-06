import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

interface ProfileOptionalSectionProps {
  children: ReactNode
  defaultOpen?: boolean
  description: string
  title: string
}

export function ProfileOptionalSection({ children, defaultOpen = false, description, title }: ProfileOptionalSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <details className="surface-card-tint group rounded-(--radius-panel) border border-(--surface-panel-border) p-4 [&_summary::-webkit-details-marker]:hidden" onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)} open={open}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
        <span className="grid min-w-0 gap-1">
          <span className="text-[0.96rem] font-semibold text-(--text-headline)">{title}</span>
          <span className="text-(length:--text-description) leading-6 text-foreground-muted">{description}</span>
        </span>

        <span className="inline-flex items-center gap-1 rounded-full border border-(--field-border) bg-(--field) px-2.5 py-1 text-(length:--text-tiny) font-medium uppercase tracking-(--tracking-mono) text-foreground-muted transition-transform group-open:[&_svg]:rotate-180">
          <ChevronDown className="size-3 transition-transform duration-200" />
          Optional
        </span>
      </summary>

      <div className="mt-4 grid gap-4 border-t border-(--surface-panel-border) pt-4">{children}</div>
    </details>
  )
}
