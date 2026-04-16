import type { ReactNode } from 'react'
import type { LearnedInstructionIntelligenceSummary } from '../../lib/source-intelligence-utils'

interface ProfileIntelligenceSummariesProps {
  className: string
  emptyState?: ReactNode
  intelligenceSummaries: readonly LearnedInstructionIntelligenceSummary[]
  listClassName: string
  sectionClassName: string
  titleClassName: string
}

export function ProfileIntelligenceSummaries({
  className,
  emptyState = null,
  intelligenceSummaries,
  listClassName,
  sectionClassName,
  titleClassName,
}: ProfileIntelligenceSummariesProps) {
  if (intelligenceSummaries.length === 0) {
    return <>{emptyState}</>
  }

  return (
    <div className={className}>
      {intelligenceSummaries.map((summary) => (
        <section className={sectionClassName} key={summary.title}>
          <p className={titleClassName}>{summary.title}</p>
          <dl className={listClassName}>
            {summary.items.map((item) => (
              <div className="grid gap-0.5" key={`${summary.title}_${item.label}`}>
                <dt className="font-medium text-foreground">{item.label}</dt>
                <dd className="break-words">{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}
