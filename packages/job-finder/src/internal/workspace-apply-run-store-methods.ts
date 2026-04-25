import { ApplyRunDetailsSchema, type ApplyRunDetails } from "@unemployed/contracts";
import type { WorkspaceServiceContext } from "./workspace-service-context";

function parsePersistedTimestamp(value: string) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    throw new Error('Encountered invalid persisted timestamp while sorting apply run details.')
  }

  return parsed
}

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

      const latestResult = [...results].sort(
        (left, right) =>
          parsePersistedTimestamp(right.updatedAt) - parsePersistedTimestamp(left.updatedAt) ||
          right.id.localeCompare(left.id),
      )[0] ?? null;
      const latestApproval =
        approvals.find((entry) => entry.id === run.submitApprovalId) ??
        [...approvals].sort(
          (left, right) =>
            parsePersistedTimestamp(right.createdAt) - parsePersistedTimestamp(left.createdAt) ||
            right.id.localeCompare(left.id),
        )[0] ??
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
              return parsePersistedTimestamp(getTimestamp(value))
            })(),
          }))
          .sort(
            (left, right) =>
              left.timestamp - right.timestamp ||
              (tieBreak ? tieBreak(left.value, right.value) : 0),
          )
          .map(({ value }) => value);

      return ApplyRunDetailsSchema.parse({
        run,
        result: latestResult,
        results,
        submitApproval: latestApproval,
        questionRecords: sortByTimestamp(
          questionRecords,
          (record) => record.detectedAt,
          (left, right) => left.id.localeCompare(right.id),
        ),
        answerRecords: sortByTimestamp(
          answerRecords,
          (record) => record.createdAt,
          (left, right) => left.id.localeCompare(right.id),
        ),
        artifactRefs: sortByTimestamp(
          artifactRefs,
          (record) => record.createdAt,
          (left, right) => left.id.localeCompare(right.id),
        ),
        checkpoints: sortByTimestamp(
          checkpoints,
          (record) => record.createdAt,
          (left, right) => left.id.localeCompare(right.id),
        ),
        consentRequests: sortByTimestamp(
          consentRequests,
          (record) => record.requestedAt,
          (left, right) => left.id.localeCompare(right.id),
        ),
      });
    },
  };
}
