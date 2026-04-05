import type {
  SourceDebugRunDetails,
  SourceDebugRunRecord,
  SourceInstructionArtifact
} from '@unemployed/contracts'
import { Button } from '@renderer/components/ui/button'
import { formatDuration, formatStatusLabel } from '../../lib/job-finder-utils'

function formatTimestamp(value: string | null): string | null {
  if (!value) {
    return null
  }

  return new Date(value).toLocaleString()
}

function calcAttemptDurationMs(startedAt: string, completedAt: string | null): number | null {
  if (!completedAt) return null
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  return ms > 0 ? ms : null
}

function formatEvidenceCount(details: SourceDebugRunDetails, attemptId: string): number {
  return details.evidenceRefs.filter((entry) => entry.attemptId === attemptId).length
}

function formatInstructionActionLabel(artifact: SourceInstructionArtifact | null): string | null {
  if (!artifact) {
    return null
  }

  return artifact.status === 'draft' || artifact.status === 'validated'
    ? 'Verify instructions'
    : null
}

interface ProfileSourceDebugReviewModalContentProps {
  artifact: SourceInstructionArtifact | null
  busy: boolean
  details: SourceDebugRunDetails | null
  errorMessage: string | null
  loading: boolean
  onLoadRun: (runId: string) => void
  onVerify: (instructionId: string) => void
  recentRuns: readonly SourceDebugRunRecord[]
  recentRunsLabelId: string
  selectedRunId: string | null
}

export function ProfileSourceDebugReviewModalContent({
  artifact,
  busy,
  details,
  errorMessage,
  loading,
  onLoadRun,
  onVerify,
  recentRuns,
  recentRunsLabelId,
  selectedRunId
}: ProfileSourceDebugReviewModalContentProps) {
  const selectedRun = recentRuns.find((run) => run.id === selectedRunId) ?? recentRuns[0] ?? null
  const primaryActionLabel = formatInstructionActionLabel(artifact)
  const formattedRunTime = details
    ? formatTimestamp(details.run.completedAt ?? details.run.updatedAt)
    : null

  return (
    <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside
        aria-labelledby={recentRunsLabelId}
        className="grid min-h-0 content-start gap-3 overflow-y-auto border-b border-(--surface-panel-border) px-4 py-4 lg:border-b-0 lg:border-r"
      >
        <p className="text-[0.72rem] uppercase tracking-(--tracking-label) text-foreground-muted" id={recentRunsLabelId}>
          Recent runs
        </p>
        <ul className="grid gap-2 pb-1">
          {recentRuns.map((run) => {
            const isSelected = run.id === selectedRun?.id

            return (
              <li key={run.id}>
                <button
                  aria-current={isSelected ? 'true' : undefined}
                  className={[
                    'grid w-full gap-1 rounded-(--radius-panel) border px-3 py-3 text-left transition-colors',
                    isSelected
                      ? 'border-primary/40 bg-primary/10 text-foreground'
                      : 'surface-card-tint border-(--surface-panel-border) text-foreground-soft hover:bg-secondary'
                  ].join(' ')}
                  onClick={() => onLoadRun(run.id)}
                  type="button"
                >
                  <span className="text-[0.82rem] font-medium text-foreground">{formatStatusLabel(run.state)}</span>
                  <span className="text-[0.76rem] text-foreground-muted">{formatTimestamp(run.completedAt ?? run.updatedAt)}</span>
                  {run.timing ? (
                    <span className="text-[0.74rem] text-foreground-muted">{formatDuration(run.timing.totalDurationMs)}</span>
                  ) : null}
                  {run.finalSummary ? (
                    <span className="line-clamp-3 text-[0.78rem] leading-5 text-foreground-soft">{run.finalSummary}</span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      <section className="grid min-h-0 content-start gap-4 overflow-y-auto px-5 py-4">
        {loading ? (
          <div
            aria-atomic="true"
            aria-live="polite"
            className="surface-card-tint rounded-(--radius-panel) border border-(--surface-panel-border) px-4 py-4 text-[0.9rem] text-foreground-soft"
            role="status"
          >
            Loading run details…
          </div>
        ) : errorMessage ? (
          <div
            aria-atomic="true"
            aria-live="assertive"
            className="rounded-(--radius-panel) border border-critical/35 bg-(--workspace-state-card-bg-error) px-4 py-4 text-[0.9rem] text-foreground"
            role="alert"
          >
            {errorMessage}
          </div>
        ) : details ? (
          <>
            <article className="surface-card-tint grid gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-1">
                  <p className="text-[0.72rem] uppercase tracking-(--tracking-label) text-foreground-muted">
                    Run outcome
                  </p>
                  <p className="text-[1rem] font-medium text-foreground">
                    {formatStatusLabel(details.run.state)}
                    {formattedRunTime
                      ? ` • ${formattedRunTime}`
                      : ''}
                  </p>
                </div>
                {artifact ? (
                  <div className="flex flex-wrap gap-2">
                    {primaryActionLabel ? (
                      <Button disabled={busy} onClick={() => onVerify(artifact.id)} type="button" variant="ghost">
                        {primaryActionLabel}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {details.run.finalSummary ? (
                <p className="text-[0.92rem] leading-6 text-foreground">{details.run.finalSummary}</p>
              ) : null}
              {details.run.timing ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.82rem] text-foreground-muted">
                  <span>Duration: {formatDuration(details.run.timing.totalDurationMs)}</span>
                  {details.run.timing.longestGapMs > 10000 ? (
                    <span>Longest quiet gap: {formatDuration(details.run.timing.longestGapMs)}</span>
                  ) : null}
                  {details.run.timing.browserSetupMs != null ? (
                    <span>Browser setup: {formatDuration(details.run.timing.browserSetupMs)}</span>
                  ) : null}
                  {details.run.timing.finalReviewMs != null ? (
                    <span>AI review: {formatDuration(details.run.timing.finalReviewMs)}</span>
                  ) : null}
                </div>
              ) : null}
              {details.run.manualPrerequisiteSummary ? (
                <p className="text-[0.85rem] leading-6 text-foreground-soft">{details.run.manualPrerequisiteSummary}</p>
              ) : null}
            </article>

            <div className="grid gap-3">
              {details.attempts.map((attempt) => {
                const evidenceCount = formatEvidenceCount(details, attempt.id)
                const attemptDurationMs = calcAttemptDurationMs(attempt.startedAt, attempt.completedAt)

                return (
                  <article
                    className="surface-card-tint grid gap-3 rounded-(--radius-panel) border border-(--surface-panel-border) px-4 py-4"
                    key={attempt.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="grid gap-1">
                        <p className="text-[0.72rem] uppercase tracking-(--tracking-label) text-foreground-muted">
                          {formatStatusLabel(attempt.phase)}
                        </p>
                        <p className="text-[0.95rem] font-medium text-foreground">
                          {formatStatusLabel(attempt.outcome)} • {formatStatusLabel(attempt.completionMode)}
                        </p>
                      </div>
                      <div className="text-right text-[0.76rem] text-foreground-muted">
                        <p>{formatTimestamp(attempt.completedAt ?? attempt.startedAt)}</p>
                        {attemptDurationMs != null ? <p>{formatDuration(attemptDurationMs)}</p> : null}
                        <p>{evidenceCount} evidence refs</p>
                      </div>
                    </div>
                    <p className="text-[0.92rem] leading-6 text-foreground">{attempt.resultSummary}</p>
                    {attempt.completionReason ? (
                      <p className="text-[0.84rem] leading-6 text-foreground-soft">
                        End reason: {attempt.completionReason}
                      </p>
                    ) : null}
                    {attempt.phaseEvidence ? (
                      <div className="grid gap-2 text-[0.84rem] text-foreground-soft">
                        {attempt.phaseEvidence.visibleControls.length > 0 ? (
                          <p>Visible controls: {attempt.phaseEvidence.visibleControls.join(' • ')}</p>
                        ) : null}
                        {attempt.phaseEvidence.routeSignals.length > 0 ? (
                          <p>Route signals: {attempt.phaseEvidence.routeSignals.join(' • ')}</p>
                        ) : null}
                        {attempt.phaseEvidence.attemptedControls.length > 0 ? (
                          <p>Attempted controls: {attempt.phaseEvidence.attemptedControls.join(' • ')}</p>
                        ) : null}
                        {attempt.phaseEvidence.warnings.length > 0 ? (
                          <p>Warnings: {attempt.phaseEvidence.warnings.join(' • ')}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                )
              })}
            </div>
          </>
        ) : (
          <div className="surface-card-tint rounded-(--radius-panel) border border-(--surface-panel-border) px-4 py-4 text-[0.9rem] text-foreground-soft">
            No retained run details are available for this target yet.
          </div>
        )}
      </section>
    </div>
  )
}
