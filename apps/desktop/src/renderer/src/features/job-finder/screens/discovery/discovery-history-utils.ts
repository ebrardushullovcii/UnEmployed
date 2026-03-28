import type {
  DiscoveryActivityEvent,
  DiscoveryRunRecord,
  DiscoveryTargetExecution,
  JobSearchPreferences
} from '@unemployed/contracts'

export type DiscoveryTargetConfig = JobSearchPreferences['discovery']['targets'][number]

export function formatOutcomeLabel(value: DiscoveryRunRecord['summary']['outcome']): string {
  return value === 'running'
    ? 'Running now'
    : value.charAt(0).toUpperCase() + value.slice(1)
}

function createPlannedExecution(target: DiscoveryTargetConfig): DiscoveryTargetExecution {
  return {
    targetId: target.id,
    adapterKind: target.adapterKind,
    resolvedAdapterKind: null,
    state: 'planned',
    startedAt: null,
    completedAt: null,
    jobsFound: 0,
    jobsPersisted: 0,
    jobsStaged: 0,
    warning: null
  }
}

function getTerminalExecutionState(event: DiscoveryActivityEvent): DiscoveryTargetExecution['state'] | null {
  if (event.terminalState) {
    return event.terminalState
  }

  if (event.stage !== 'target') {
    return event.stage === 'persistence' ? 'completed' : null
  }

  if (event.kind === 'error' || event.message.includes(' failed: ')) {
    return 'failed'
  }

  if (event.message.includes('cancelled before completion')) {
    return 'cancelled'
  }

  if (event.message.includes('was skipped')) {
    return 'skipped'
  }

  if (event.message.includes('session is not ready')) {
    return 'failed'
  }

  return null
}

export function buildLiveRunRecord(
  liveEvents: readonly DiscoveryActivityEvent[],
  targets: readonly DiscoveryTargetConfig[]
): DiscoveryRunRecord | null {
  const firstEvent = liveEvents[0]

  if (!firstEvent) {
    return null
  }

  const runId = firstEvent.runId
  const runEvents = liveEvents.filter((event) => event.runId === runId)
  const enabledTargets = targets.filter((target) => target.enabled)
  const executions = new Map(enabledTargets.map((target) => [target.id, createPlannedExecution(target)]))

  for (const event of runEvents) {
    if (!event.targetId) {
      continue
    }

    const currentExecution = executions.get(event.targetId)

    if (!currentExecution) {
      continue
    }

    const nextExecution: DiscoveryTargetExecution = {
      ...currentExecution,
      adapterKind: event.adapterKind ?? currentExecution.adapterKind,
      resolvedAdapterKind: event.resolvedAdapterKind ?? currentExecution.resolvedAdapterKind,
      jobsFound: event.jobsFound ?? currentExecution.jobsFound,
      jobsPersisted: event.jobsPersisted ?? currentExecution.jobsPersisted,
      jobsStaged: event.jobsStaged ?? currentExecution.jobsStaged
    }

    if (event.stage === 'target' && event.message.startsWith('Starting target')) {
      nextExecution.state = 'running'
      nextExecution.startedAt = nextExecution.startedAt ?? event.timestamp
    }

    const terminalState = getTerminalExecutionState(event)
    if (terminalState) {
      nextExecution.state = terminalState
      nextExecution.startedAt = nextExecution.startedAt ?? event.timestamp
      nextExecution.completedAt = event.timestamp
      nextExecution.warning = event.kind === 'warning' || event.kind === 'error' ? event.message : currentExecution.warning
    }

    if (event.stage !== 'target' && nextExecution.state === 'planned') {
      nextExecution.state = 'running'
      nextExecution.startedAt = nextExecution.startedAt ?? event.timestamp
    }

    executions.set(event.targetId, nextExecution)
  }

  const targetExecutions = enabledTargets.map((target) => executions.get(target.id) ?? createPlannedExecution(target))
  const targetsCompleted = targetExecutions.filter((execution) => execution.state !== 'planned' && execution.state !== 'running').length

  return {
    id: runId,
    state: 'running',
    startedAt: firstEvent.timestamp,
    completedAt: null,
    targetIds: enabledTargets.map((target) => target.id),
    targetExecutions,
    activity: runEvents,
    summary: {
      targetsPlanned: enabledTargets.length,
      targetsCompleted,
      validJobsFound: targetExecutions.reduce((total, execution) => total + execution.jobsFound, 0),
      jobsPersisted: targetExecutions.reduce((total, execution) => total + execution.jobsPersisted, 0),
      jobsStaged: targetExecutions.reduce((total, execution) => total + execution.jobsStaged, 0),
      duplicatesMerged: 0,
      invalidSkipped: 0,
      durationMs: Math.max(0, new Date().getTime() - new Date(firstEvent.timestamp).getTime()),
      outcome: 'running'
    }
  }
}

export function getRunOptions(
  liveRun: DiscoveryRunRecord | null,
  activeRun: DiscoveryRunRecord | null,
  recentRuns: readonly DiscoveryRunRecord[]
): DiscoveryRunRecord[] {
  const runs = [liveRun, activeRun, ...recentRuns].filter((run): run is DiscoveryRunRecord => Boolean(run))
  const seen = new Set<string>()

  return runs.filter((run) => {
    if (seen.has(run.id)) {
      return false
    }

    seen.add(run.id)
    return true
  })
}
