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
        runMatches,
        results,
        approvals,
        questionRecords,
        answerRecords,
        artifactRefs,
        checkpoints,
        consentRequests,
      ] = await Promise.all([
        ctx.repository.listApplyRuns({ id: runId }),
        ctx.repository.listApplyJobResults({ runId, jobId }),
        ctx.repository.listApplySubmitApprovals({ runId }),
        ctx.repository.listApplicationQuestionRecords({ runId, jobId }),
        ctx.repository.listApplicationAnswerRecords({ runId, jobId }),
        ctx.repository.listApplicationArtifactRefs({ runId, jobId }),
        ctx.repository.listApplicationReplayCheckpoints({ runId, jobId }),
        ctx.repository.listApplicationConsentRequests({ runId, jobId }),
      ]);
      const run = runMatches[0];

      if (!run) {
        throw new Error(`Unknown apply run '${runId}'.`);
      }

      if (!run.jobIds.includes(jobId)) {
        throw new Error(`Apply run '${runId}' does not include job '${jobId}'.`);
      }

      const latestResult = results[0] ?? null;
      const latestApproval =
        approvals.find((entry) => entry.id === run.submitApprovalId) ??
        approvals[0] ??
        null;

      const sortByTimestamp = <TValue>(
        values: readonly TValue[],
        getTimestamp: (value: TValue) => string,
        tieBreak?: (left: TValue, right: TValue) => number,
      ) =>
        values
          .map((value) => ({
            value,
            timestamp: (() => {
              const parsed = Date.parse(getTimestamp(value))
              if (!Number.isFinite(parsed)) {
                throw new Error('Encountered invalid persisted timestamp while sorting apply run details.')
              }

              return parsed
            })(),
          }))
          .sort(
            (left, right) =>
              left.timestamp - right.timestamp ||
              (tieBreak ? tieBreak(left.value, right.value) : 0),
          )
          .map(({ value }) => value);

      return ApplyRunDetailsSchema.parse({
          run: ApplyRunSchema.parse(run),
          result: latestResult,
          results,
        submitApproval: latestApproval,
        questionRecords: sortByTimestamp(questionRecords, (record) => record.detectedAt),
        answerRecords: sortByTimestamp(answerRecords, (record) => record.createdAt),
        artifactRefs: sortByTimestamp(artifactRefs, (record) => record.createdAt),
        checkpoints: sortByTimestamp(
          checkpoints,
          (record) => record.createdAt,
          (left, right) => left.id.localeCompare(right.id),
        ),
        consentRequests: sortByTimestamp(consentRequests, (record) => record.requestedAt),
      });
    },
  };
}
