import type {
  EditableSourceInstructionArtifact,
  SourceDebugProgressEvent,
  SourceDebugRunDetails,
  SourceDebugRunRecord,
} from "@unemployed/contracts";
import { createWorkspaceSourceDebugStoreMethods } from "./workspace-source-debug-store-methods";
import { runSourceDebugWorkflow } from "./workspace-source-debug-workflow";
import type { WorkspaceServiceContext } from "./workspace-service-context";
import type { JobFinderWorkspaceService } from "./workspace-service-contracts";

export function createWorkspaceSourceDebugMethods(
  ctx: WorkspaceServiceContext,
): Pick<
  JobFinderWorkspaceService,
  | "runSourceDebug"
  | "cancelSourceDebug"
  | "getSourceDebugRun"
  | "getSourceDebugRunDetails"
  | "listSourceDebugRuns"
  | "saveSourceInstructionArtifact"
  | "acceptSourceInstructionDraft"
  | "verifySourceInstructions"
> & {
  runSourceDebugWorkflow: (
    targetId: string,
    signal?: AbortSignal,
    options?: {
      clearExistingInstructions?: boolean;
      reviewInstructionId?: string | null;
    },
    onProgress?: (event: SourceDebugProgressEvent) => void,
  ) => Promise<ReturnType<WorkspaceServiceContext["getWorkspaceSnapshot"]> extends Promise<infer T> ? T : never>;
} {
  const storeMethods = createWorkspaceSourceDebugStoreMethods(ctx);

  return {
    runSourceDebugWorkflow: (targetId, signal, options, onProgress) =>
      runSourceDebugWorkflow(ctx, targetId, signal, options, onProgress),
    async runSourceDebug(targetId, signal, onProgress) {
      return runSourceDebugWorkflow(ctx, targetId, signal, {
        clearExistingInstructions: true,
      }, onProgress);
    },
    async cancelSourceDebug(runId) {
      if (
        ctx.activeSourceDebugExecutionIdRef.current !== runId ||
        !ctx.activeSourceDebugAbortControllerRef.current
      ) {
        return ctx.getWorkspaceSnapshot();
      }

      ctx.activeSourceDebugAbortControllerRef.current.abort();

      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (ctx.activeSourceDebugExecutionIdRef.current === null) {
          break;
        }

        await new Promise<void>((resolve) => {
          setTimeout(resolve, 50);
        });
      }

      return ctx.getWorkspaceSnapshot();
    },
    getSourceDebugRun(runId): Promise<SourceDebugRunRecord> {
      return storeMethods.getSourceDebugRun(runId);
    },
    getSourceDebugRunDetails(runId): Promise<SourceDebugRunDetails> {
      return storeMethods.getSourceDebugRunDetails(runId);
    },
    listSourceDebugRuns(targetId) {
      return storeMethods.listSourceDebugRuns(targetId);
    },
    saveSourceInstructionArtifact(
      targetId: string,
      artifact: EditableSourceInstructionArtifact,
    ) {
      return storeMethods.saveSourceInstructionArtifact(targetId, artifact);
    },
    acceptSourceInstructionDraft(targetId, instructionId) {
      return storeMethods.acceptSourceInstructionDraft(targetId, instructionId);
    },
    async verifySourceInstructions(targetId, instructionId, signal, onProgress) {
      const artifacts = await ctx.repository.listSourceInstructionArtifacts();
      const artifact = artifacts.find(
        (entry) => entry.id === instructionId && entry.targetId === targetId,
      );

      if (!artifact) {
        throw new Error(`Unknown source instruction '${instructionId}'.`);
      }

      return runSourceDebugWorkflow(ctx, targetId, signal, {
        clearExistingInstructions: false,
        reviewInstructionId: artifact.id,
      }, onProgress);
    },
  };
}
