import type { JobFinderDiscoveryState, JobSource, SavedJob } from "@unemployed/contracts";

export function mergeSessionStates(
  currentSessions: ReadonlyArray<JobFinderDiscoveryState["sessions"][number]>,
  nextSession: JobFinderDiscoveryState["sessions"][number],
): JobFinderDiscoveryState["sessions"] {
  const nextByKind = new Map(
    currentSessions.map((session) => [session.adapterKind, session]),
  );
  nextByKind.set(nextSession.adapterKind, nextSession);
  return [...nextByKind.values()];
}

export function mergePendingJobs(
  currentJobs: readonly SavedJob[],
  nextJobs: readonly SavedJob[],
): SavedJob[] {
  const nextById = new Map(currentJobs.map((job) => [job.id, job]));
  for (const job of nextJobs) {
    nextById.set(job.id, job);
  }
  return [...nextById.values()].sort(
    (left, right) => right.matchAssessment.score - left.matchAssessment.score,
  );
}

export function mergeSavedJobs(
  currentJobs: readonly SavedJob[],
  nextJobs: readonly SavedJob[],
): SavedJob[] {
  const nextById = new Map(currentJobs.map((job) => [job.id, job]));
  for (const job of nextJobs) {
    nextById.set(job.id, job);
  }
  return [...nextById.values()];
}

export function overlayTouchedSavedJobs(
  currentJobs: readonly SavedJob[],
  nextJobs: readonly SavedJob[],
  touchedIds: ReadonlySet<string>,
): SavedJob[] {
  return mergeSavedJobs(
    currentJobs.filter((job) => !touchedIds.has(job.id)),
    nextJobs.filter((job) => touchedIds.has(job.id)),
  );
}

export function overlayTouchedPendingJobs(
  currentJobs: readonly SavedJob[],
  nextJobs: readonly SavedJob[],
  touchedIds: ReadonlySet<string>,
): SavedJob[] {
  return mergePendingJobs(
    currentJobs.filter((job) => !touchedIds.has(job.id)),
    nextJobs.filter((job) => touchedIds.has(job.id)),
  );
}

export function createBrowserSessionSnapshot(
  sessions: ReadonlyArray<JobFinderDiscoveryState["sessions"][number]>,
  preferredAdapter: JobSource,
) {
  const preferredSession =
    sessions.find((session) => session.adapterKind === preferredAdapter) ??
    sessions[0];

  if (preferredSession) {
    return {
      source: preferredSession.adapterKind,
      status: preferredSession.status,
      driver: preferredSession.driver,
      label: preferredSession.label,
      detail: preferredSession.detail,
      lastCheckedAt: preferredSession.lastCheckedAt,
    };
  }

  return {
    source: preferredAdapter,
    status: "unknown" as const,
    driver: "catalog_seed" as const,
    label: "Session status unavailable",
    detail: "No discovery adapter session has been initialized yet.",
    lastCheckedAt: new Date(0).toISOString(),
  };
}
