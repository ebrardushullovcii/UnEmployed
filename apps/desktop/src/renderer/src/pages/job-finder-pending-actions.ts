export const jobFinderPendingActions = {
  apply: () => 'apply',
  applyRequest: (requestId: string) => `apply:request:${requestId}`,
  applyRun: (runId: string) => `apply:run:${runId}`,
  browserSession: () => 'browser:session',
  discoveryAll: () => 'discovery:all',
  discoveryJob: (jobId: string) => `discovery:job:${jobId}`,
  discoveryTarget: (targetId: string) => `discovery:target:${targetId}`,
  profileAnalyze: () => 'profile:analyze',
  profileImport: () => 'profile:import',
  profileMutation: () => 'profile:mutation',
  profileReviewItem: (reviewItemId: string) => `profile:review:${reviewItemId}`,
  profileSetup: () => 'profile:setup',
  resumeJob: (jobId: string) => `resume:${jobId}`,
  settingsSave: () => 'settings:save',
  sourceDebug: (targetId: string) => `source-debug:${targetId}`,
  sourceInstruction: (targetId: string) => `source-instruction:${targetId}`,
  sourceInstructionVerify: (instructionId: string) =>
    `source-instruction-verify:${instructionId}`,
  workspaceReset: () => 'workspace:reset',
} as const

export type PendingActionScope = string
export type PendingActionState = Record<string, number>

export function hasPendingAction(
  pendingActionState: PendingActionState,
  scope: PendingActionScope,
): boolean {
  return (pendingActionState[scope] ?? 0) > 0
}

export function hasAnyPendingAction(
  pendingActionState: PendingActionState,
  scopes: readonly PendingActionScope[],
): boolean {
  return scopes.some((scope) => hasPendingAction(pendingActionState, scope))
}

export function listPendingActionScopes(
  pendingActionState: PendingActionState,
): readonly PendingActionScope[] {
  return Object.keys(pendingActionState)
}
