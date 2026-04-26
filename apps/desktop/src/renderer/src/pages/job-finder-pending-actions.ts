export const jobFinderPendingActions = {
  apply: (): 'apply' => 'apply',
  applyRequest: (requestId: string): `apply:request:${string}` =>
    `apply:request:${requestId}`,
  applyRun: (runId: string): `apply:run:${string}` => `apply:run:${runId}`,
  browserSession: (): 'browser:session' => 'browser:session',
  browserSessionTarget: (targetId: string): `browser:session:${string}` =>
    `browser:session:${targetId}`,
  discoveryAll: (): 'discovery:all' => 'discovery:all',
  discoveryJob: (jobId: string): `discovery:job:${string}` => `discovery:job:${jobId}`,
  discoveryTarget: (targetId: string): `discovery:target:${string}` =>
    `discovery:target:${targetId}`,
  profileAnalyze: (): 'profile:analyze' => 'profile:analyze',
  profileImport: (): 'profile:import' => 'profile:import',
  profileMutation: (): 'profile:mutation' => 'profile:mutation',
  profileReviewItem: (reviewItemId: string): `profile:review:${string}` =>
    `profile:review:${reviewItemId}`,
  profileSetup: (): 'profile:setup' => 'profile:setup',
  resumeJob: (jobId: string): `resume:${string}` => `resume:${jobId}`,
  settingsSave: (): 'settings:save' => 'settings:save',
  sourceDebug: (targetId: string): `source-debug:${string}` => `source-debug:${targetId}`,
  sourceInstruction: (targetId: string): `source-instruction:${string}` =>
    `source-instruction:${targetId}`,
  sourceInstructionVerify: (
    instructionId: string,
  ): `source-instruction-verify:${string}` =>
    `source-instruction-verify:${instructionId}`,
  workspaceReset: (): 'workspace:reset' => 'workspace:reset',
} as const

type PendingActionFactory =
  (typeof jobFinderPendingActions)[keyof typeof jobFinderPendingActions]

export type PendingActionScope = ReturnType<PendingActionFactory>
export type PendingActionState = Partial<Record<PendingActionScope, number>>

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
  return Object.entries(pendingActionState)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([scope]) => scope as PendingActionScope)
}
