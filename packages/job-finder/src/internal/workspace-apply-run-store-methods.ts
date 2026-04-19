import {
  ApplyRunDetailsSchema,
  ApplyRunSchema,
  type ApplyRunDetails,
} from "@unemployed/contracts";
import type { WorkspaceServiceContext } from "./workspace-service-context";

export function createWorkspaceApplyRunStoreMethods(ctx: WorkspaceServiceContext) {
  return {
    async getApplyRunDetails(runId: string, jobId: string): Promise<ApplyRunDetails> {
      const [
        runs,
        results,
        approvals,
        questionRecords,
        answerRecords,
        artifactRefs,
        checkpoints,
        consentRequests,
      ] = await Promise.all([
        ctx.repository.listApplyRuns(),
        ctx.repository.listApplyJobResults(),
        ctx.repository.listApplySubmitApprovals(),
        ctx.repository.listApplicationQuestionRecords({ runId, jobId }),
        ctx.repository.listApplicationAnswerRecords({ runId, jobId }),
        ctx.repository.listApplicationArtifactRefs({ runId, jobId }),
        ctx.repository.listApplicationReplayCheckpoints({ runId, jobId }),
        ctx.repository.listApplicationConsentRequests({ runId, jobId }),
      ]);
      const run = runs.find((entry) => entry.id === runId);

      if (!run) {
        throw new Error(`Unknown apply run '${runId}'.`);
      }

      if (!run.jobIds.includes(jobId)) {
        throw new Error(`Apply run '${runId}' does not include job '${jobId}'.`);
      }

      return ApplyRunDetailsSchema.parse({
        run: ApplyRunSchema.parse(run),
        result:
          results.find(
            (entry) => entry.runId === runId && entry.jobId === jobId,
          ) ?? null,
        submitApproval:
          approvals.find((entry) => entry.runId === runId) ?? null,
        questionRecords: [...questionRecords].sort(
          (left, right) =>
            new Date(left.detectedAt).getTime() -
            new Date(right.detectedAt).getTime(),
        ),
        answerRecords: [...answerRecords].sort(
          (left, right) =>
            new Date(left.createdAt).getTime() -
            new Date(right.createdAt).getTime(),
        ),
        artifactRefs: [...artifactRefs].sort(
          (left, right) =>
            new Date(left.createdAt).getTime() -
            new Date(right.createdAt).getTime(),
        ),
        checkpoints: [...checkpoints].sort(
          (left, right) =>
            new Date(left.createdAt).getTime() -
              new Date(right.createdAt).getTime() ||
            left.id.localeCompare(right.id),
        ),
        consentRequests: [...consentRequests].sort(
          (left, right) =>
            new Date(left.requestedAt).getTime() -
            new Date(right.requestedAt).getTime(),
        ),
      });
    },
  };
}
