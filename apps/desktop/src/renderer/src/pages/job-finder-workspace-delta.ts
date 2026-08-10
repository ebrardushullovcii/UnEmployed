import type {
  JobFinderWorkspaceDelta,
  JobFinderWorkspaceSnapshot,
  WorkspaceRevision,
} from "@unemployed/contracts";

export type WorkspaceDeltaApplyResult =
  | {
      status: "applied";
      revision: WorkspaceRevision;
      workspace: JobFinderWorkspaceSnapshot;
    }
  | { status: "stale" }
  | { status: "gap" };

function applyEntitySlice<T>(
  current: readonly T[],
  upserts: readonly T[],
  removedIds: readonly string[],
  getId: (value: T) => string,
): T[] {
  const removed = new Set(removedIds);
  const upsertsById = new Map(upserts.map((value) => [getId(value), value]));
  const next = current
    .filter((value) => !removed.has(getId(value)))
    .map((value) => upsertsById.get(getId(value)) ?? value);
  const existingIds = new Set(next.map(getId));

  for (const value of upserts) {
    if (!removed.has(getId(value)) && !existingIds.has(getId(value))) {
      next.push(value);
      existingIds.add(getId(value));
    }
  }

  return next;
}

function preserveValidSelection<T>(input: {
  requestedId: string | null;
  previousId: string | null;
  entities: readonly T[];
  getId: (value: T) => string;
}): string | null {
  const availableIds = new Set(input.entities.map(input.getId));

  if (input.requestedId && availableIds.has(input.requestedId)) {
    return input.requestedId;
  }

  if (input.previousId && availableIds.has(input.previousId)) {
    return input.previousId;
  }

  return input.entities[0] ? input.getId(input.entities[0]) : null;
}

export function applyJobFinderWorkspaceDelta(input: {
  revision: WorkspaceRevision;
  workspace: JobFinderWorkspaceSnapshot;
  delta: JobFinderWorkspaceDelta;
}): WorkspaceDeltaApplyResult {
  if (input.delta.currentRevision <= input.revision) {
    return { status: "stale" };
  }

  if (
    input.delta.baseRevision !== input.revision ||
    input.delta.currentRevision !== input.revision + 1
  ) {
    return { status: "gap" };
  }

  const discoveryJobs = applyEntitySlice(
    input.workspace.discoveryJobs,
    input.delta.discoveryJobs.upserts,
    input.delta.discoveryJobs.removedIds,
    (value) => value.id,
  );
  const reviewQueue = applyEntitySlice(
    input.workspace.reviewQueue,
    input.delta.reviewQueue.upserts,
    input.delta.reviewQueue.removedIds,
    (value) => value.jobId,
  );
  const applyRuns = applyEntitySlice(
    input.workspace.applyRuns,
    input.delta.applyRuns.upserts,
    input.delta.applyRuns.removedIds,
    (value) => value.id,
  );
  const applicationRecords = applyEntitySlice(
    input.workspace.applicationRecords,
    input.delta.applicationRecords.upserts,
    input.delta.applicationRecords.removedIds,
    (value) => value.id,
  );

  return {
    status: "applied",
    revision: input.delta.currentRevision,
    workspace: {
      ...input.workspace,
      generatedAt: input.delta.generatedAt,
      discoveryRunState: input.delta.discoveryRunState,
      activeDiscoveryRun: input.delta.activeDiscoveryRun,
      discoverySessions: input.delta.discoverySessions,
      sourceAccessPrompts: input.delta.sourceAccessPrompts,
      latestResumeImportRun: input.delta.latestResumeImportRun,
      discoveryJobs,
      dismissedDiscoveryJobs: applyEntitySlice(
        input.workspace.dismissedDiscoveryJobs,
        input.delta.dismissedDiscoveryJobs.upserts,
        input.delta.dismissedDiscoveryJobs.removedIds,
        (value) => value.id,
      ),
      recentDiscoveryRuns: applyEntitySlice(
        input.workspace.recentDiscoveryRuns,
        input.delta.recentDiscoveryRuns.upserts,
        input.delta.recentDiscoveryRuns.removedIds,
        (value) => value.id,
      ),
      reviewQueue,
      applyRuns,
      applyJobResults: applyEntitySlice(
        input.workspace.applyJobResults,
        input.delta.applyJobResults.upserts,
        input.delta.applyJobResults.removedIds,
        (value) => value.id,
      ),
      applicationRecords,
      applicationAttempts: applyEntitySlice(
        input.workspace.applicationAttempts,
        input.delta.applicationAttempts.upserts,
        input.delta.applicationAttempts.removedIds,
        (value) => value.id,
      ),
      userActionRequests: applyEntitySlice(
        input.workspace.userActionRequests,
        input.delta.userActionRequests.upserts,
        input.delta.userActionRequests.removedIds,
        (value) => value.id,
      ),
      userActionEvents: applyEntitySlice(
        input.workspace.userActionEvents,
        input.delta.userActionEvents.upserts,
        input.delta.userActionEvents.removedIds,
        (value) => value.id,
      ),
      selectedDiscoveryJobId: preserveValidSelection({
        requestedId: input.delta.selectedDiscoveryJobId,
        previousId: input.workspace.selectedDiscoveryJobId,
        entities: discoveryJobs,
        getId: (value) => value.id,
      }),
      selectedReviewJobId: preserveValidSelection({
        requestedId: input.delta.selectedReviewJobId,
        previousId: input.workspace.selectedReviewJobId,
        entities: reviewQueue,
        getId: (value) => value.jobId,
      }),
      selectedApplyRunId: preserveValidSelection({
        requestedId: input.delta.selectedApplyRunId,
        previousId: input.workspace.selectedApplyRunId,
        entities: applyRuns,
        getId: (value) => value.id,
      }),
      selectedApplicationRecordId: preserveValidSelection({
        requestedId: input.delta.selectedApplicationRecordId,
        previousId: input.workspace.selectedApplicationRecordId,
        entities: applicationRecords,
        getId: (value) => value.id,
      }),
    },
  };
}
