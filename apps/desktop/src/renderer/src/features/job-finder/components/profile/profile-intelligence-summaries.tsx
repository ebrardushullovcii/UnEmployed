import { useId, type ReactNode } from 'react'
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
      {intelligenceSummaries.map((summary, summaryIndex) => (
        <ProfileIntelligenceSummarySection
          key={`${summary.title}_${summaryIndex}`}
          listClassName={listClassName}
          sectionClassName={sectionClassName}
          summary={summary}
          titleClassName={titleClassName}
        />
      ))}
    </div>
  )
}

function ProfileIntelligenceSummarySection({
  listClassName,
  sectionClassName,
  summary,
  titleClassName,
}: {
  listClassName: string
  sectionClassName: string
  summary: LearnedInstructionIntelligenceSummary
  titleClassName: string
}) {
  const headingId = useId()

  return (
    <section aria-labelledby={headingId} className={sectionClassName}>
      <h3 className={titleClassName} id={headingId}>{summary.title}</h3>
      <dl className={listClassName}>
        {summary.items.map((item, itemIndex) => (
          <div className="grid gap-0.5" key={`${summary.title}_${item.label}_${itemIndex}`}>
            <dt className="font-medium text-foreground">{item.label}</dt>
            <dd className="break-words">{item.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
