import { Card, CardContent } from '@renderer/components/ui/card'

interface EmptyStateProps {
  description: string
  title: string
}

export function EmptyState({ description, title }: EmptyStateProps) {
  return (
    <Card className="min-h-[12rem] border-border/30 bg-card/80">
      <CardContent className="grid min-h-[12rem] place-items-center text-center">
        <div className="grid max-w-[28rem] gap-3">
          <h2 className="font-display text-[1.32rem] font-bold uppercase tracking-[0.02em] text-foreground">{title}</h2>
          <p className="text-sm leading-7 text-foreground-soft">{description}</p>
        </div>
      </CardContent>
    </Card>
  )
}
