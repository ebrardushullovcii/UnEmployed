import {
  ApplicationAnswerRecordSchema,
  ApplicationQuestionRecordSchema,
  UserActionEventSchema,
  UserActionRequestSchema,
  type ApplicationAnswerRecord,
  type ApplicationQuestionRecord,
  type UserActionRequest,
} from "@unemployed/contracts";
import { describe, expect, test } from "vitest";

import {
  createSeed,
  createWorkspaceServiceHarness,
} from "./workspace-service.test-support";

const now = "2026-08-15T10:00:00.000Z";
const later = "2026-08-15T11:00:00.000Z";

function createManualAnswerRequest(
  overrides: Partial<UserActionRequest> = {},
): UserActionRequest {
  return UserActionRequestSchema.parse({
    id: "request_a",
    dedupeKey: "dedupe_request_a",
    revision: 1,
    kind: "manual_answer",
    state: "pending",
    requirement: "required",
    scope: {
      type: "application",
      runId: "run_manual",
      jobId: "job_ready",
      resultId: "result_a",
      replayCheckpointId: null,
      source: "target_site",
    },
    verification: {
      type: "page_blocker_absent",
      blockerFingerprint: "blocker_request_a",
      expectedPageFingerprint: null,
    },
    title: "Answer the required question",
    summary: "A safe manual answer is required.",
    instructions: [],
    actionUrl: null,
    displayOrigin: null,
    credentialsPolicy: "browser_only",
    submitAuthorized: false,
    accountCreationAuthorized: false,
    attemptCount: 0,
    maxAttempts: 3,
    createdAt: now,
    updatedAt: now,
    openedAt: null,
    resolvedAt: null,
    expiresAt: null,
    ...overrides,
  });
}

function createQuestion(): ApplicationQuestionRecord {
  return ApplicationQuestionRecordSchema.parse({
    id: "question_a",
    runId: "run_manual",
    jobId: "job_ready",
    resultId: "result_a",
    prompt: "Years of experience",
    kind: "experience",
    answerControlType: "text",
    isRequired: true,
    detectedAt: now,
    answerOptions: [],
    suggestedAnswers: [],
    selectedAnswerId: null,
    submittedAnswer: null,
    status: "detected",
    pageUrl: null,
    visualContext: null,
  });
}

function createAnswer(input: {
  id: string;
  questionId?: string;
  revision?: number;
  supersedesAnswerId?: string | null;
  text?: string;
  createdAt?: string;
}): ApplicationAnswerRecord {
  return ApplicationAnswerRecordSchema.parse({
    id: input.id,
    runId: "run_manual",
    jobId: "job_ready",
    resultId: "result_a",
    questionId: input.questionId ?? "question_a",
    status: "suggested",
    text: input.text ?? "5 years",
    value: { type: "text", value: input.text ?? "5 years" },
    revision: input.revision ?? 1,
    saveScope: "application_once",
    supersedesAnswerId: input.supersedesAnswerId ?? null,
    sourceKind: "user",
    sourceId: null,
    confidenceLabel: null,
    provenance: [],
    createdAt: input.createdAt ?? now,
    submittedAt: null,
  });
}

function submitManualAnswerCommand(commandId = "command_submit") {
  return {
    action: "submit_manual_answer" as const,
    requestId: "request_a",
    commandId,
    expectedRevision: 1,
    answer: "5 years",
    saveForFuture: false,
    credentialsPolicy: "browser_only" as const,
    submitAuthorized: false as const,
    accountCreationAuthorized: false as const,
  };
}

describe("workspace manual-answer persistence races", () => {
  test("creates a monotonic revision-1 manual answer with no superseded record", async () => {
    const seed = createSeed();
    seed.userActionRequests = [createManualAnswerRequest()];
    seed.applicationQuestionRecords = [createQuestion()];
    const harness = createWorkspaceServiceHarness({ seed });

    const snapshot = await harness.workspaceService.performUserAction(
      submitManualAnswerCommand(),
    );

    expect(snapshot.userActionRequests[0]).toEqual(
      expect.objectContaining({ state: "verifying", revision: 2 }),
    );
    const answers = await harness.repository.listApplicationAnswerRecords();
    expect(answers).toHaveLength(1);
    expect(answers[0]).toEqual(
      expect.objectContaining({
        id: "manual_answer_request_a_2",
        questionId: "question_a",
        revision: 1,
        supersedesAnswerId: null,
        status: "suggested",
        submittedAt: null,
        text: "5 years",
      }),
    );
    // Prepare-only: the question stays detected and unsubmitted.
    const questions = await harness.repository.listApplicationQuestionRecords();
    expect(questions[0]).toEqual(
      expect.objectContaining({ status: "detected", submittedAnswer: null }),
    );
  });

  test("advances the revision and supersedes the actual latest record for the question", async () => {
    const seed = createSeed();
    seed.userActionRequests = [createManualAnswerRequest()];
    seed.applicationQuestionRecords = [createQuestion()];
    seed.applicationAnswerRecords = [
      createAnswer({
        id: "answer_existing",
        revision: 1,
        supersedesAnswerId: null,
        text: "3 years",
      }),
    ];
    const harness = createWorkspaceServiceHarness({ seed });

    await harness.workspaceService.performUserAction(
      submitManualAnswerCommand(),
    );

    const answers = await harness.repository.listApplicationAnswerRecords();
    const byId = new Map(answers.map((answer) => [answer.id, answer]));
    expect(answers).toHaveLength(2);
    expect(byId.get("manual_answer_request_a_2")).toEqual(
      expect.objectContaining({
        revision: 2,
        supersedesAnswerId: "answer_existing",
        status: "suggested",
        submittedAt: null,
      }),
    );
    expect(byId.get("answer_existing")).toEqual(
      expect.objectContaining({ revision: 1, supersedesAnswerId: null }),
    );
  });

  test("an exact retry of the deterministic record id is idempotent and preserves createdAt", async () => {
    const seed = createSeed();
    seed.userActionRequests = [createManualAnswerRequest()];
    seed.applicationQuestionRecords = [createQuestion()];
    const harness = createWorkspaceServiceHarness({ seed });

    const command = submitManualAnswerCommand("command_retry");
    await harness.workspaceService.performUserAction(command);
    const first = await harness.repository.listApplicationAnswerRecords();
    expect(first).toHaveLength(1);
    const createdAt = first[0]!.createdAt;

    // Re-issuing the exact same command is the reducer-stale retry path; the
    // exact commandId event exists, so the answer is re-persisted idempotently
    // (no new revision, no rewritten createdAt).
    await harness.workspaceService.performUserAction(command);
    const second = await harness.repository.listApplicationAnswerRecords();
    expect(second).toHaveLength(1);
    expect(second[0]).toEqual(
      expect.objectContaining({
        id: "manual_answer_request_a_2",
        revision: 1,
        supersedesAnswerId: null,
        createdAt,
      }),
    );
  });

  test("a same-id conflict throws instead of overwriting", async () => {
    const seed = createSeed();
    seed.userActionRequests = [createManualAnswerRequest()];
    seed.applicationQuestionRecords = [createQuestion()];
    seed.applicationAnswerRecords = [
      createAnswer({
        id: "manual_answer_request_a_2",
        revision: 1,
        supersedesAnswerId: null,
        text: "conflicting answer",
      }),
    ];
    const harness = createWorkspaceServiceHarness({ seed });

    await expect(
      harness.workspaceService.performUserAction(submitManualAnswerCommand()),
    ).rejects.toThrow(/already exists with different data/i);

    // The conflicting record is untouched.
    const answers = await harness.repository.listApplicationAnswerRecords();
    expect(answers).toHaveLength(1);
    expect(answers[0]).toEqual(
      expect.objectContaining({
        id: "manual_answer_request_a_2",
        text: "conflicting answer",
      }),
    );
  });

  test("a commit race returning stale never persists the answer", async () => {
    const seed = createSeed();
    seed.userActionRequests = [createManualAnswerRequest()];
    seed.applicationQuestionRecords = [createQuestion()];
    const harness = createWorkspaceServiceHarness({ seed });

    // Simulate a concurrent writer advancing the request between the reducer
    // and the caller's commit: the caller's transition then returns stale.
    const originalCommit = harness.repository.commitUserActionTransition.bind(
      harness.repository,
    );
    let advanced = false;
    harness.repository.commitUserActionTransition = async (input) => {
      if (!advanced) {
        advanced = true;
        const current = await harness.repository.getUserActionRequest(
          input.request.id,
        );
        if (current) {
          const advancedRequest = UserActionRequestSchema.parse({
            ...current,
            revision: current.revision + 1,
            state: "page_opened",
            openedAt: current.openedAt ?? later,
            updatedAt: later,
          });
          await originalCommit({
            request: advancedRequest,
            event: UserActionEventSchema.parse({
              id: "race_advance",
              requestId: advancedRequest.id,
              operation: "open_page",
              previousRevision: current.revision,
              resultingRevision: advancedRequest.revision,
              previousState: current.state,
              resultingState: "page_opened",
              occurredAt: later,
            }),
          });
        }
      }
      return originalCommit(input);
    };

    await harness.workspaceService.performUserAction(
      submitManualAnswerCommand(),
    );

    // The reducer saw the current revision, but the commit returned stale, so
    // the answer must not be persisted for this command.
    expect(await harness.repository.listApplicationAnswerRecords()).toEqual([]);
    const request = await harness.repository.getUserActionRequest("request_a");
    expect(request).toEqual(
      expect.objectContaining({ state: "page_opened", revision: 2 }),
    );
    const events = await harness.repository.listUserActionEvents({
      requestId: "request_a",
    });
    expect(events.some((event) => event.id === "command_submit")).toBe(false);
  });
});
