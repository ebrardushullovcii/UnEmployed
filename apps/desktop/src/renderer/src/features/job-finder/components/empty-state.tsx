import { cn } from '@renderer/lib/utils'

interface EmptyStateProps {
  className?: string
  description: string
  title: string
}

export function EmptyState({ className, description, title }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'grid min-h-56 w-full place-items-center overflow-hidden rounded-(--radius-panel) border border-dashed border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.012))] px-6 py-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]',
        className
      )}
    >
      <div className="grid max-w-136 gap-3">
        <span className="text-[0.62rem] uppercase tracking-(--tracking-caps) text-muted-foreground">Awaiting state</span>
        <h2 className="font-display text-[1.48rem] font-semibold tracking-[-0.03em] text-(--text-headline)">{title}</h2>
        <p className="text-[0.96rem] leading-7 text-foreground-soft">{description}</p>
      </div>
    </div>
  )
}
