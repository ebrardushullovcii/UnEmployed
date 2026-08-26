import type {
  ApplicationRecord,
  ApplicationStatus,
  AssetStatus,
  CandidateProfile,
  JobFinderSettings,
  ResumeDraft,
  ResumeExportArtifact,
  ReviewQueueItem,
  SavedJob,
  TailoredAsset,
} from "@unemployed/contracts";

import { compareDiscoveryJobs } from "../discovery-ordering";
import { resolveJobResumeApplicationMode } from "./job-resume-application-mode";

export { compareDiscoveryJobs };

const reviewableStatuses = new Set<ApplicationStatus>([
  "drafting",
  "ready_for_review",
  "approved",
]);

const discoveryVisibleStatuses = new Set<ApplicationStatus>([
  "discovered",
  "shortlisted",
  "drafting",
  "ready_for_review",
  "approved",
]);

const assetStatusPriority: Record<AssetStatus, number> = {
  ready: 0,
  generating: 1,
  queued: 2,
  failed: 3,
  not_started: 4,
};

function getLatestApprovedExport(
  current: ResumeExportArtifact | null,
  candidate: ResumeExportArtifact,
): ResumeExportArtifact {
  if (!current) {
    return candidate;
  }

  return new Date(candidate.exportedAt).getTime() >
    new Date(current.exportedAt).getTime()
    ? candidate
    : current;
}

function buildResumeReviewState(
  draft: ResumeDraft | null,
  approvedExport: ResumeExportArtifact | null,
): ReviewQueueItem["resumeReview"] {
  if (!draft) {
    return { status: "not_started" };
  }

  if (draft.status === "approved" && draft.approvedAt && approvedExport) {
    return {
      status: "approved",
      approvedAt: draft.approvedAt,
      approvedExportId: approvedExport.id,
      approvedFormat: approvedExport.format,
      approvedFilePath: approvedExport.filePath,
    };
  }

  if (draft.status === "stale") {
    return {
      status: "stale",
      staleReason: draft.staleReason ?? null,
    };
  }

  if (draft.status === "approved") {
    return {
      status: "needs_review",
    };
  }

  return {
    status: draft.status,
  };
}

export function buildReviewQueue(
  savedJobs: readonly SavedJob[],
  tailoredAssets: readonly TailoredAsset[],
  resumeDrafts: readonly ResumeDraft[],
  resumeExportArtifacts: readonly ResumeExportArtifact[],
  profile?: CandidateProfile,
  settings?: JobFinderSettings,
): ReviewQueueItem[] {
  const originalResume = profile?.baseResume ?? null;
  const originalResumePath = originalResume?.storagePath?.trim() ?? "";
  const assetsByJobId = new Map(
    tailoredAssets.map((asset) => [asset.jobId, asset]),
  );
  const draftsByJobId = new Map(
    resumeDrafts.map((draft) => [draft.jobId, draft]),
  );
  const approvedExportsByJobId = new Map<string, ResumeExportArtifact>();

  for (const artifact of resumeExportArtifacts) {
    if (!artifact.isApproved) {
      continue;
    }

    approvedExportsByJobId.set(
      artifact.jobId,
      getLatestApprovedExport(
        approvedExportsByJobId.get(artifact.jobId) ?? null,
        artifact,
      ),
    );
  }

  return savedJobs
    .filter((job) => reviewableStatuses.has(job.status))
    .map<ReviewQueueItem>((job) => {
      const resumeApplicationMode = resolveJobResumeApplicationMode(
        job,
        settings ?? {},
      );
      const usesOriginalResume = resumeApplicationMode === "original_resume";

      if (usesOriginalResume) {
        const hasOriginalResume = Boolean(
          originalResume && originalResumePath && originalResume.sha256,
        );
        return {
          jobId: job.id,
          title: job.title,
          company: job.company,
          location: job.location,
          matchScore: job.matchAssessment.score,
          applicationStatus: job.status,
          resumeApplicationMode,
          assetStatus: hasOriginalResume ? "ready" : "not_started",
          progressPercent: hasOriginalResume ? 100 : null,
          resumeAssetId: hasOriginalResume ? originalResume!.id : null,
          resumeReview: hasOriginalResume
            ? {
                status: "original_resume",
                sourceDocumentId: originalResume!.id,
                fileName: originalResume!.fileName,
                filePath: originalResumePath,
              }
            : { status: "not_started" },
          updatedAt:
            [originalResume?.textUpdatedAt, originalResume?.uploadedAt]
              .filter((value): value is string => Boolean(value))
              .sort()
              .at(-1) ?? job.discoveredAt,
        };
      }

      const asset = assetsByJobId.get(job.id) ?? null;
      const draft = draftsByJobId.get(job.id) ?? null;
      const approvedExport = approvedExportsByJobId.get(job.id) ?? null;
      const resumeReview = buildResumeReviewState(draft, approvedExport);
      const updatedAtCandidates = [
        asset?.updatedAt,
        draft?.updatedAt,
        approvedExport?.exportedAt,
        job.discoveredAt,
      ].filter((value): value is string => Boolean(value));

      return {
        jobId: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        matchScore: job.matchAssessment.score,
        applicationStatus: job.status,
        resumeApplicationMode,
        assetStatus: asset?.status ?? "not_started",
        progressPercent: asset?.progressPercent ?? null,
        resumeAssetId: asset?.id ?? null,
        resumeReview,
        updatedAt: updatedAtCandidates.sort().at(-1) ?? job.discoveredAt,
      };
    })
    .sort((left, right) => {
      const assetDelta =
        assetStatusPriority[left.assetStatus] -
        assetStatusPriority[right.assetStatus];

      if (assetDelta !== 0) {
        return assetDelta;
      }

      return right.matchScore - left.matchScore;
    });
}

export function buildDiscoveryJobs(savedJobs: readonly SavedJob[]): SavedJob[] {
  return [...savedJobs]
    .filter((job) => discoveryVisibleStatuses.has(job.status))
    .sort(compareDiscoveryJobs);
}

export function buildApplicationRecords(
  savedApplicationRecords: readonly ApplicationRecord[],
): ApplicationRecord[] {
  return [...savedApplicationRecords].sort(
    (left, right) =>
      new Date(right.lastUpdatedAt).getTime() -
      new Date(left.lastUpdatedAt).getTime(),
  );
}
