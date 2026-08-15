import {
  ApplicationAnswerRecordSchema,
  type ApplicationAnswerRecord,
  type SubmitUserActionManualAnswerCommand,
  UserActionCommandSchema,
  type UserActionCommand,
  type UserActionRequest,
} from "@unemployed/contracts";

import { reduceUserActionCommand } from "../user-action-domain";
import {
  createReusableAnswerForQuestion,
  normalizeAnswerQuestion,
} from "./workspace-answer-memory";
import {
  isApplicationAuthenticationUserActionKind,
  isApplicationPrepareOnlyUserAction,
} from "./workspace-application-user-action";
import type { WorkspaceServiceContext } from "./workspace-service-context";
import type { JobFinderWorkspaceService } from "./workspace-service-contracts";
import {
  getUserActionVerificationFlightKey,
  isSourceAccessUserAction,
  verifySourceAccessUserAction,
} from "./workspace-user-action-verification";

type WorkspaceUserActionMethods = Pick<
  JobFinderWorkspaceService,
  "performUserAction"
> & {
  resumeVerifyingUserActions(): Promise<void>;
};

function isApplicationResumptionAction(request: UserActionRequest): boolean {
  if (request.scope.type !== "application") return false;

  return (
    (request.state === "resolved" &&
      isApplicationAuthenticationUserActionKind(request.kind) &&
      request.verification.type === "source_access") ||
    (isApplicationPrepareOnlyUserAction(request) &&
      (request.state === "verifying" || request.state === "resolved"))
  );
}

function getApplicationResumptionFlightKey(request: UserActionRequest): string {
  const targetRevision =
    request.state === "verifying" ? request.revision + 1 : request.revision;
  return `${request.id}:${targetRevision}`;
}

/**
 * Deterministic recency ordering for answer records: revision desc, then
 * createdAt desc, then id desc. Revisions are unique per question in a
 * well-formed store, but the tie-breaks keep the latest selection stable.
 */
function compareAnswerRecency(
  left: ApplicationAnswerRecord,
  right: ApplicationAnswerRecord,
): number {
  return (
    right.revision - left.revision ||
    Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
    right.id.localeCompare(left.id)
  );
}

/** Latest persisted answer record for a question, with a deterministic tie-break. */
function latestAnswerForQuestion(
  records: readonly ApplicationAnswerRecord[],
  questionId: string,
): ApplicationAnswerRecord | null {
  let latest: ApplicationAnswerRecord | null = null;
  for (const record of records) {
    if (record.questionId !== questionId) continue;
    if (latest === null || compareAnswerRecency(record, latest) < 0) {
      latest = record;
    }
  }
  return latest;
}

/**
 * Proves the caller's exact `submit_manual_answer` command event is already
 * persisted. The event id is the caller's commandId, so a grouped apply event
 * (which uses its own deterministic id) can never be mistaken for the caller's
 * command; the previous/resulting revisions pin the exact transition.
 */
async function hasPersistedExactSubmitManualAnswerEvent(input: {
  ctx: WorkspaceServiceContext;
  command: SubmitUserActionManualAnswerCommand;
  request: UserActionRequest;
}): Promise<boolean> {
  const events = await input.ctx.repository.listUserActionEvents({
    requestId: input.request.id,
    operation: "submit_manual_answer",
  });
  return events.some(
    (event) =>
      event.id === input.command.commandId &&
      event.requestId === input.request.id &&
      event.operation === "submit_manual_answer" &&
      event.previousRevision === input.command.expectedRevision &&
      event.resultingRevision === input.command.expectedRevision + 1 &&
      event.resultingState === "verifying",
  );
}

async function persistManualAnswer(input: {
  command: SubmitUserActionManualAnswerCommand;
  ctx: WorkspaceServiceContext;
  request: UserActionRequest;
  resultingRevision: number;
}): Promise<void> {
  if (input.request.scope.type !== "application") {
    throw new Error("Manual answers require an application action.");
  }

  const scope = input.request.scope;
  if (!scope.resultId) {
    throw new Error(
      "This manual answer is missing its exact application result scope.",
    );
  }
  const questions = (
    await input.ctx.repository.listApplicationQuestionRecords({
      runId: scope.runId,
      jobId: scope.jobId,
      resultId: scope.resultId,
    })
  ).filter((question) => question.status === "detected");
  if (questions.length !== 1) {
    throw new Error(
      "This action does not identify exactly one reviewable question. Answer it in the browser, then save it from Profile if you want to reuse it.",
    );
  }

  const question = questions[0];
  if (!question) return;
  const now = new Date().toISOString();
  const answer = input.command.answer.trim();

  if (input.command.saveForFuture) {
    const profile = await input.ctx.repository.getProfile();
    const normalizedPrompt = normalizeAnswerQuestion(question.prompt);
    const exactMatches = profile.answerBank.customAnswers.filter((candidate) =>
      [candidate.question, candidate.label].some(
        (value) => normalizeAnswerQuestion(value) === normalizedPrompt,
      ),
    );
    const conflicting = exactMatches.some(
      (candidate) => candidate.answer.trim() !== answer,
    );
    if (conflicting) {
      throw new Error(
        "A different saved answer already exists for this exact question. Use this answer once or resolve the saved answer in Profile; nothing was overwritten.",
      );
    }
    if (exactMatches.length === 0) {
      await input.ctx.repository.saveProfile({
        ...profile,
        answerBank: {
          ...profile.answerBank,
          customAnswers: [
            ...profile.answerBank.customAnswers,
            createReusableAnswerForQuestion({
              answer,
              prompt: question.prompt,
              kind: question.kind,
            }),
          ],
        },
      });
    }
  }

  const recordId = `manual_answer_${input.request.id}_${input.resultingRevision}`;
  const records = await input.ctx.repository.listApplicationAnswerRecords();
  const existingById = records.find((record) => record.id === recordId) ?? null;
  // The exact retry reuses the already-persisted record as the basis of the
  // revision chain, so the deterministic id stays idempotent: the retry never
  // creates another revision and never rewrites createdAt.
  const baseRecords = existingById
    ? records.filter((record) => record.id !== recordId)
    : records;
  const latest = latestAnswerForQuestion(baseRecords, question.id);

  const record = ApplicationAnswerRecordSchema.parse({
    id: recordId,
    runId: scope.runId,
    jobId: scope.jobId,
    resultId: scope.resultId,
    questionId: question.id,
    status: "suggested",
    text: answer,
    sourceKind: "user",
    sourceId: input.request.id,
    confidenceLabel: "User-provided for this exact question",
    provenance: [
      {
        id: `manual_answer_provenance_${input.request.id}_${input.resultingRevision}`,
        sourceKind: "user",
        sourceId: input.request.id,
        label: input.command.saveForFuture
          ? "Entered in Action inbox and saved to Profile"
          : "Entered in Action inbox for this application only",
        snippet: question.prompt,
      },
    ],
    // Monotonically increasing revision based on the actual latest persisted
    // record for the question, never a fixed revision-1 write that could
    // clobber a newer answer (for example one created by a grouped apply).
    revision: (latest?.revision ?? 0) + 1,
    supersedesAnswerId: latest?.id ?? null,
    createdAt: existingById?.createdAt ?? now,
    submittedAt: null,
  });

  if (existingById) {
    if (JSON.stringify(existingById) === JSON.stringify(record)) {
      // Exact idempotent retry of the deterministic record id.
      return;
    }
    throw new Error(
      `Answer record '${recordId}' already exists with different data.`,
    );
  }

  await input.ctx.repository.upsertApplicationAnswerRecord(record);
}
export function createWorkspaceUserActionMethods(
  ctx: WorkspaceServiceContext,
): WorkspaceUserActionMethods {
  const commandFlights = new Map<
    string,
    Promise<Awaited<ReturnType<JobFinderWorkspaceService["performUserAction"]>>>
  >();
  const verificationFlights = new Map<string, Promise<void>>();
  const applicationResumptionFlights = new Map<string, Promise<void>>();

  function resumeApplicationSingleFlight(
    request: UserActionRequest,
  ): Promise<void> {
    if (!isApplicationResumptionAction(request)) {
      return Promise.resolve();
    }

    const key = getApplicationResumptionFlightKey(request);
    const existing = applicationResumptionFlights.get(key);
    if (existing) return existing;

    const flight = ctx.resumeApplicationUserAction(request).finally(() => {
      if (applicationResumptionFlights.get(key) === flight) {
        applicationResumptionFlights.delete(key);
      }
    });
    applicationResumptionFlights.set(key, flight);
    return flight;
  }

  function verifySingleFlight(request: UserActionRequest): Promise<void> {
    const key = getUserActionVerificationFlightKey(request);
    const existing = verificationFlights.get(key);
    if (existing) return existing;

    const flight = (async () => {
      const resolvedRequest = await verifySourceAccessUserAction({
        browserRuntime: ctx.browserRuntime,
        repository: ctx.repository,
        request,
      });
      if (resolvedRequest) {
        await resumeApplicationSingleFlight(resolvedRequest);
      }
    })().finally(() => {
      if (verificationFlights.get(key) === flight) {
        verificationFlights.delete(key);
      }
    });
    verificationFlights.set(key, flight);
    return flight;
  }

  async function resumeVerifyingUserActions(): Promise<void> {
    const verifyingRequests = await ctx.repository.listUserActionRequests({
      states: ["verifying"],
    });
    await Promise.all(
      verifyingRequests.map((request) => {
        if (isSourceAccessUserAction(request)) {
          return verifySingleFlight(request);
        }
        return isApplicationResumptionAction(request)
          ? resumeApplicationSingleFlight(request)
          : Promise.resolve();
      }),
    );

    const resolvedApplicationRequests =
      await ctx.repository.listUserActionRequests({
        states: ["resolved"],
        scopeType: "application",
      });
    await Promise.all(
      resolvedApplicationRequests
        .filter(isApplicationResumptionAction)
        .map((request) => resumeApplicationSingleFlight(request)),
    );
  }

  async function performUserActionOnce(command: UserActionCommand) {
    const request = await ctx.repository.getUserActionRequest(
      command.requestId,
    );

    if (!request) {
      throw new Error("This action is no longer available.");
    }

    const reduction = reduceUserActionCommand(
      request,
      command,
      new Date().toISOString(),
    );

    if (reduction.status === "stale") {
      if (
        command.action === "submit_manual_answer" &&
        request.state === "verifying" &&
        request.revision === command.expectedRevision + 1
      ) {
        // A verifying request at the expected resulting revision is not by
        // itself proof the caller's command applied: a grouped apply or any
        // other writer moves manual-answer requests to verifying too. Persist
        // only when listUserActionEvents proves the exact commandId event
        // exists with operation submit_manual_answer and the expected and
        // resulting revisions; a grouped event id is never the caller's id.
        if (
          await hasPersistedExactSubmitManualAnswerEvent({
            ctx,
            command,
            request,
          })
        ) {
          await persistManualAnswer({
            command,
            ctx,
            request,
            resultingRevision: request.revision,
          });
        }
      }
      if (
        command.action === "confirm_done" ||
        command.action === "submit_manual_answer"
      ) {
        if (
          request.state === "verifying" &&
          isSourceAccessUserAction(request)
        ) {
          await verifySingleFlight(request);
        } else if (isApplicationResumptionAction(request)) {
          await resumeApplicationSingleFlight(request);
        }
      }
      return ctx.getWorkspaceSnapshot();
    }

    if (command.action === "open_page") {
      if (!request.actionUrl) {
        throw new Error(
          "This action does not have a safe browser page to open.",
        );
      }

      await ctx.openRunBrowserSession(request.scope.source, {
        targetUrl: request.actionUrl,
      });
    }

    const commandCommit = await ctx.repository.commitUserActionTransition({
      request: reduction.request,
      event: reduction.event,
    });

    if (commandCommit.status === "stale") {
      // The reducer saw the current revision but a concurrent writer advanced
      // the request before this commit, so the caller's transition did not
      // apply and the answer must not be persisted. Only "applied" and
      // "duplicate" prove the exact command event is persisted. The current
      // verifying request still resumes so a lost response to an earlier
      // successful commit of the same command recovers through the
      // single-flight resumer.
      if (
        command.action === "confirm_done" ||
        command.action === "submit_manual_answer"
      ) {
        const current = commandCommit.request;
        if (
          current.state === "verifying" &&
          isSourceAccessUserAction(current)
        ) {
          await verifySingleFlight(current);
        } else if (isApplicationResumptionAction(current)) {
          await resumeApplicationSingleFlight(current);
        }
      }
      return ctx.getWorkspaceSnapshot();
    }

    if (command.action === "submit_manual_answer") {
      await persistManualAnswer({
        command,
        ctx,
        request: commandCommit.request,
        resultingRevision: commandCommit.request.revision,
      });
    }

    if (
      command.action === "confirm_done" ||
      command.action === "submit_manual_answer"
    ) {
      if (
        commandCommit.request.state === "verifying" &&
        isSourceAccessUserAction(commandCommit.request)
      ) {
        await verifySingleFlight(commandCommit.request);
      } else if (isApplicationResumptionAction(commandCommit.request)) {
        await resumeApplicationSingleFlight(commandCommit.request);
      }
    }

    return ctx.getWorkspaceSnapshot();
  }

  return {
    resumeVerifyingUserActions,
    performUserAction(commandInput) {
      const command = UserActionCommandSchema.parse(commandInput);
      const existing = commandFlights.get(command.commandId);
      if (existing) return existing;

      const flight = performUserActionOnce(command).finally(() => {
        if (commandFlights.get(command.commandId) === flight) {
          commandFlights.delete(command.commandId);
        }
      });
      commandFlights.set(command.commandId, flight);
      return flight;
    },
  };
}
