import {
  ApplicationAttemptBlockerSchema,
  ApplyExecutionResultSchema,
  UserActionRequestSchema,
} from "@unemployed/contracts";
import type { BrowserSessionRuntime } from "@unemployed/browser-runtime";
import { describe, expect, test, vi } from "vitest";

import { persistApplicationUserAction } from "./internal/workspace-application-user-action";
import { reduceUserActionCommand } from "./user-action-domain";
import { createJobFinderWorkspaceService } from "./index";
import {
  createBrowserRuntime,
  createSeed,
  createWorkspaceServiceHarness,
} from "./workspace-service.test-support";
describe("application login UserActionRequest adoption", () => {
  test("persists one strict application-scoped request for a login blocker", async () => {
    const harness = createWorkspaceServiceHarness({ seed: createSeed() });
    const job = (await harness.repository.listSavedJobs())[0];
    if (!job) throw new Error("Expected a saved job fixture.");
    const blocker = ApplicationAttemptBlockerSchema.parse({
      code: "site_login_required",
      summary: "Sign in before continuing.",
      detail: "The application page requires a browser-owned account session.",
      questionIds: [],
      sourceDebugEvidenceRefIds: [],
      url: job.applicationUrl,
    });

    const input = {
      repository: harness.repository,
      applicationRecordId: `application_${job.id}`,
      job,
      runId: "apply_run_login",
      resultId: "apply_result_login",
      replayCheckpointId: "apply_checkpoint_login",
      blocker,
      occurredAt: "2026-07-30T10:00:00.000Z",
    } as const;
    await persistApplicationUserAction(input);
    await persistApplicationUserAction(input);

    const requests = await harness.repository.listUserActionRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      kind: "login",
      state: "pending",
      // This fixture intentionally has no employer application URL. The
      // prepare-only login handoff uses the saved canonical listing as the
      // safe same-origin page where the user can sign in before retrying the
      // exact application checkpoint.
      actionUrl: job.canonicalUrl,
      displayOrigin: "https://www.linkedin.com/",
      credentialsPolicy: "browser_only",
      submitAuthorized: false,
      accountCreationAuthorized: false,
      scope: {
        type: "application",
        runId: "apply_run_login",
        jobId: job.id,
        resultId: "apply_result_login",
        replayCheckpointId: "apply_checkpoint_login",
        source: job.source,
      },
      verification: {
        type: "source_access",
        expectedOrigin: "https://www.linkedin.com/",
      },
    });
  });

  test("persists no Needs-you request when the application page never opened", async () => {
    const harness = createWorkspaceServiceHarness({ seed: createSeed() });
    const job = (await harness.repository.listSavedJobs())[0];
    if (!job) throw new Error("Expected a saved job fixture.");
    const blocker = ApplicationAttemptBlockerSchema.parse({
      code: "application_page_unreachable",
      summary: "Job Finder could not open the application page.",
      detail:
        "The dedicated browser could not load this employer page, so preparation stopped before the page opened. Nothing was filled, attached, or submitted.",
      questionIds: [],
      sourceDebugEvidenceRefIds: [],
      url: job.applicationUrl,
    });

    await persistApplicationUserAction({
      repository: harness.repository,
      applicationRecordId: `application_${job.id}`,
      job,
      runId: "apply_run_unreachable",
      resultId: "apply_result_unreachable",
      replayCheckpointId: "apply_checkpoint_unreachable",
      blocker,
      occurredAt: "2026-07-30T10:00:00.000Z",
    });

    expect(await harness.repository.listUserActionRequests()).toEqual([]);
  });

  test("keeps only the latest rerun handoff actionable for one job", async () => {
    const harness = createWorkspaceServiceHarness({ seed: createSeed() });
    const job = (await harness.repository.listSavedJobs())[0];
    if (!job) throw new Error("Expected a saved job fixture.");
    const blocker = ApplicationAttemptBlockerSchema.parse({
      code: "requires_manual_review",
      userActionKind: "other",
      summary: "Complete the browser-owned step.",
      url: job.applicationUrl,
    });

    await persistApplicationUserAction({
      repository: harness.repository,
      applicationRecordId: `application_${job.id}`,
      job,
      runId: "apply_run_old",
      resultId: "apply_result_old",
      replayCheckpointId: "apply_checkpoint_old",
      blocker,
      occurredAt: "2026-07-30T10:00:00.000Z",
    });
    const oldRequest = (await harness.repository.listUserActionRequests())[0];
    if (!oldRequest) throw new Error("Expected the first user action.");
    const opened = reduceUserActionCommand(
      oldRequest,
      {
        action: "open_page",
        requestId: oldRequest.id,
        commandId: "open-old-application-action",
        expectedRevision: oldRequest.revision,
      },
      "2026-07-30T10:05:00.000Z",
    );
    if (opened.status !== "applied") {
      throw new Error("Expected the old user action to open.");
    }
    await harness.repository.commitUserActionTransition({
      request: opened.request,
      event: opened.event,
    });

    await persistApplicationUserAction({
      repository: harness.repository,
      applicationRecordId: `application_${job.id}`,
      job,
      runId: "apply_run_new",
      resultId: "apply_result_new",
      replayCheckpointId: "apply_checkpoint_new",
      blocker,
      occurredAt: "2026-07-30T11:00:00.000Z",
    });

    const requests = await harness.repository.listUserActionRequests();
    const previous = requests.find(
      (request) =>
        request.scope.type === "application" &&
        request.scope.runId === "apply_run_old",
    );
    const latest = requests.find(
      (request) =>
        request.scope.type === "application" &&
        request.scope.runId === "apply_run_new",
    );
    expect(requests).toHaveLength(2);
    if (!previous || !latest) {
      throw new Error("Expected both application action generations.");
    }
    expect(previous).toMatchObject({
      revision: 3,
      state: "superseded",
      openedAt: "2026-07-30T10:05:00.000Z",
      resolvedAt: "2026-07-30T11:00:00.000Z",
    });
    expect(latest).toMatchObject({ revision: 1, state: "pending" });
    expect(
      requests.filter(
        (request) =>
          request.scope.type === "application" &&
          request.scope.jobId === job.id &&
          ![
            "resolved",
            "skipped",
            "cancelled",
            "expired",
            "superseded",
          ].includes(request.state),
      ),
    ).toEqual([latest]);
    expect(
      (
        await harness.repository.listUserActionEvents({
          requestId: previous?.id,
        })
      ).map((event) => event.operation),
    ).toEqual(["created", "open_page", "supersede"]);
  });

  test("does not supersede a blocker owned by a sibling application record", async () => {
    const harness = createWorkspaceServiceHarness({ seed: createSeed() });
    const job = (await harness.repository.listSavedJobs())[0];
    if (!job) throw new Error("Expected a saved job fixture.");
    const blocker = ApplicationAttemptBlockerSchema.parse({
      code: "requires_manual_review",
      summary: "Complete the browser-owned step.",
      url: job.applicationUrl,
    });

    await persistApplicationUserAction({
      repository: harness.repository,
      applicationRecordId: "application_a",
      job,
      runId: "run_a",
      resultId: "result_a",
      replayCheckpointId: "checkpoint_a",
      blocker,
      occurredAt: "2026-07-30T10:00:00.000Z",
    });
    await persistApplicationUserAction({
      repository: harness.repository,
      applicationRecordId: "application_b",
      job,
      runId: "run_b",
      resultId: "result_b",
      replayCheckpointId: "checkpoint_b",
      blocker,
      occurredAt: "2026-07-30T11:00:00.000Z",
    });

    expect(
      (await harness.repository.listUserActionRequests())
        .map((request) => ({
          applicationRecordId:
            request.scope.type === "application"
              ? request.scope.applicationRecordId
              : null,
          state: request.state,
        }))
        .sort((left, right) =>
          (left.applicationRecordId ?? "").localeCompare(
            right.applicationRecordId ?? "",
          ),
        ),
    ).toEqual([
      { applicationRecordId: "application_a", state: "pending" },
      { applicationRecordId: "application_b", state: "pending" },
    ]);
  });

  test("supersedes a stale same-job handoff after a newer blocker-free final checkpoint", async () => {
    const harness = createWorkspaceServiceHarness({ seed: createSeed() });
    const job = (await harness.repository.listSavedJobs())[0];
    if (!job) throw new Error("Expected a saved job fixture.");
    const blocker = ApplicationAttemptBlockerSchema.parse({
      code: "requires_manual_review",
      userActionKind: "other",
      summary: "Complete the browser-owned step.",
      url: job.applicationUrl,
    });

    await persistApplicationUserAction({
      repository: harness.repository,
      applicationRecordId: `application_${job.id}`,
      job,
      runId: "apply_run_failed",
      resultId: "apply_result_failed",
      replayCheckpointId: "apply_checkpoint_failed",
      blocker,
      occurredAt: "2026-07-30T10:00:00.000Z",
    });
    const unrelatedJob = { ...job, id: "job_unrelated" };
    await persistApplicationUserAction({
      repository: harness.repository,
      applicationRecordId: `application_${unrelatedJob.id}`,
      job: unrelatedJob,
      runId: "apply_run_unrelated",
      resultId: "apply_result_unrelated",
      replayCheckpointId: "apply_checkpoint_unrelated",
      blocker,
      occurredAt: "2026-07-30T10:10:00.000Z",
    });
    await harness.repository.createUserActionRequest(
      UserActionRequestSchema.parse({
        id: "source-login-unrelated",
        dedupeKey: "source-login:unrelated",
        revision: 1,
        kind: "login",
        state: "pending",
        requirement: "required",
        scope: {
          type: "discovery_source",
          targetId: "target-linkedin",
          source: "target_site",
        },
        verification: {
          type: "source_access",
          targetId: "target-linkedin",
          blockerFingerprint: "source-login:unrelated",
          expectedOrigin: "https://www.linkedin.com/",
        },
        title: "Sign in to search",
        summary: "Sign in in the managed browser.",
        createdAt: "2026-07-30T10:15:00.000Z",
        updatedAt: "2026-07-30T10:15:00.000Z",
      }),
    );

    await persistApplicationUserAction({
      repository: harness.repository,
      applicationRecordId: `application_${job.id}`,
      job,
      runId: "apply_run_success",
      resultId: "apply_result_success",
      resultState: "awaiting_review",
      resultStartedAt: "2026-07-30T11:00:00.000Z",
      replayCheckpointId: "apply_checkpoint_final",
      blocker: null,
      occurredAt: "2026-07-30T11:05:00.000Z",
    });

    const requests = await harness.repository.listUserActionRequests();
    const staleApplication = requests.find(
      (request) =>
        request.scope.type === "application" && request.scope.jobId === job.id,
    );
    const unrelatedApplication = requests.find(
      (request) =>
        request.scope.type === "application" &&
        request.scope.jobId === unrelatedJob.id,
    );
    const sourceLogin = requests.find(
      (request) => request.scope.type === "discovery_source",
    );
    if (!staleApplication) {
      throw new Error("Expected the stale application handoff history.");
    }
    expect(staleApplication).toMatchObject({
      state: "superseded",
      revision: 2,
      resolvedAt: "2026-07-30T11:05:00.000Z",
    });
    expect(unrelatedApplication).toMatchObject({ state: "pending" });
    expect(sourceLogin).toMatchObject({ state: "pending" });
    expect(
      (
        await harness.repository.listUserActionEvents({
          requestId: staleApplication.id,
        })
      ).map((event) => event.operation),
    ).toEqual(["created", "supersede"]);
  });

  test("does not let an older blocker-free result retire a newer same-job handoff", async () => {
    const harness = createWorkspaceServiceHarness({ seed: createSeed() });
    const job = (await harness.repository.listSavedJobs())[0];
    if (!job) throw new Error("Expected a saved job fixture.");

    await persistApplicationUserAction({
      repository: harness.repository,
      applicationRecordId: `application_${job.id}`,
      job,
      runId: "apply_run_newer_blocker",
      resultId: "apply_result_newer_blocker",
      replayCheckpointId: "apply_checkpoint_newer_blocker",
      blocker: ApplicationAttemptBlockerSchema.parse({
        code: "requires_manual_review",
        userActionKind: "other",
        summary: "Complete the newer browser-owned step.",
        url: job.applicationUrl,
      }),
      occurredAt: "2026-07-30T12:00:00.000Z",
    });

    await persistApplicationUserAction({
      repository: harness.repository,
      applicationRecordId: `application_${job.id}`,
      job,
      runId: "apply_run_older_success",
      resultId: "apply_result_older_success",
      resultState: "awaiting_review",
      resultStartedAt: "2026-07-30T11:00:00.000Z",
      replayCheckpointId: "apply_checkpoint_older_final",
      blocker: null,
      occurredAt: "2026-07-30T13:00:00.000Z",
    });

    const requests = await harness.repository.listUserActionRequests();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.state).toBe("pending");
    expect(requests[0]?.scope).toEqual({
      type: "application",
      runId: "apply_run_newer_blocker",
      jobId: job.id,
      applicationRecordId: `application_${job.id}`,
      resultId: "apply_result_newer_blocker",
      replayCheckpointId: "apply_checkpoint_newer_blocker",
      source: job.source,
    });
  });

  test.each([
    ["signup", "Create your account"],
    ["email_verification", "Verify your email"],
    ["mfa", "Complete MFA"],
  ] as const)(
    "persists and deduplicates a safe %s authentication request",
    async (kind, expectedTitleVerb) => {
      const harness = createWorkspaceServiceHarness({ seed: createSeed() });
      const job = (await harness.repository.listSavedJobs())[0];
      if (!job) throw new Error("Expected a saved job fixture.");
      const blocker = ApplicationAttemptBlockerSchema.parse({
        code: "requires_manual_review",
        userActionKind: kind,
        summary: "Complete the browser-owned authentication step.",
        url: job.applicationUrl,
      });
      const input = {
        repository: harness.repository,
        applicationRecordId: `application_${job.id}`,
        job,
        runId: `apply_run_${kind}`,
        resultId: `apply_result_${kind}`,
        replayCheckpointId: `apply_checkpoint_${kind}`,
        blocker,
        occurredAt: "2026-07-30T10:00:00.000Z",
      } as const;

      await persistApplicationUserAction(input);
      await persistApplicationUserAction(input);

      const requests = await harness.repository.listUserActionRequests();
      expect(requests).toHaveLength(1);
      expect(requests[0]?.title).toContain(expectedTitleVerb);
      expect(requests[0]?.dedupeKey).toMatch(
        new RegExp(`^application_${kind}:`),
      );
      expect(requests[0]).toMatchObject({
        kind,
        credentialsPolicy: "browser_only",
        submitAuthorized: false,
        accountCreationAuthorized: false,
        scope: {
          type: "application",
          runId: `apply_run_${kind}`,
          resultId: `apply_result_${kind}`,
          replayCheckpointId: `apply_checkpoint_${kind}`,
        },
        verification: {
          type: "source_access",
          expectedOrigin: "https://www.linkedin.com/",
        },
      });
    },
  );

  test.each([
    "captcha",
    "existing_account_choice",
    "manual_answer",
    "legal_consent",
    "external_redirect",
    "manual_upload",
    "other",
  ] as const)(
    "persists and deduplicates a prepare-only %s request",
    async (kind) => {
      const harness = createWorkspaceServiceHarness({ seed: createSeed() });
      const job = (await harness.repository.listSavedJobs())[0];
      if (!job) throw new Error("Expected a saved job fixture.");

      await persistApplicationUserAction({
        repository: harness.repository,
        applicationRecordId: `application_${job.id}`,
        job,
        runId: `apply_run_${kind}`,
        resultId: `apply_result_${kind}`,
        replayCheckpointId: `apply_checkpoint_${kind}`,
        blocker: ApplicationAttemptBlockerSchema.parse({
          code: "requires_manual_review",
          userActionKind: kind,
          summary: "Complete a non-authentication browser step.",
          url: job.applicationUrl,
        }),
        occurredAt: "2026-07-30T10:00:00.000Z",
      });

      const requests = await harness.repository.listUserActionRequests();
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        kind,
        state: "pending",
        credentialsPolicy: "browser_only",
        submitAuthorized: false,
        accountCreationAuthorized: false,
        scope: {
          type: "application",
          runId: `apply_run_${kind}`,
          resultId: `apply_result_${kind}`,
          replayCheckpointId: `apply_checkpoint_${kind}`,
        },
        verification: {
          type: "page_blocker_absent",
        },
      });
      expect(requests[0]?.verification).toHaveProperty("blockerFingerprint");
    },
  );
  test("adopts a real Apply Copilot login result with exact run and result lineage", async () => {
    const seed = createSeed();
    seed.settings.resumeApplicationMode = "original_resume";
    seed.profile.baseResume.storagePath = "C:/tmp/alex-vanguard.pdf";
    const baseRuntime = createBrowserRuntime();
    const executeApplicationFlow = vi.fn(
      async (
        source: Parameters<typeof baseRuntime.executeApplicationFlow>[0],
        input: Parameters<typeof baseRuntime.executeApplicationFlow>[1],
      ) => {
        const baseResult = await baseRuntime.executeApplicationFlow(
          source,
          input,
        );
        return ApplyExecutionResultSchema.parse({
          ...baseResult,
          state: "paused",
          summary: "Sign in to continue",
          detail: "The application page requires a browser-owned session.",
          blocker: {
            code: "site_login_required",
            summary: "Sign in to continue",
            detail: "The application page requires a browser-owned session.",
            questionIds: [],
            sourceDebugEvidenceRefIds: [],
            url: input.job.applicationUrl ?? input.job.canonicalUrl,
          },
        });
      },
    );
    const harness = createWorkspaceServiceHarness({
      seed,
      browserRuntime: { ...baseRuntime, executeApplicationFlow },
    });

    const snapshot =
      await harness.workspaceService.startApplyCopilotRun("job_ready");
    const run = snapshot.applyRuns[0];
    const result = snapshot.applyJobResults[0];

    expect(run).toBeTruthy();
    expect(result).toBeTruthy();
    expect(snapshot.userActionRequests).toHaveLength(1);
    expect(snapshot.userActionRequests[0]).toMatchObject({
      kind: "login",
      state: "pending",
      scope: {
        type: "application",
        runId: run?.id,
        jobId: "job_ready",
        resultId: result?.id,
        replayCheckpointId: result?.latestCheckpointId,
      },
      verification: {
        type: "source_access",
        targetId: null,
        expectedOrigin: "https://www.linkedin.com/",
      },
      submitAuthorized: false,
      accountCreationAuthorized: false,
    });
    expect(executeApplicationFlow).toHaveBeenCalledOnce();
    const executionCall = executeApplicationFlow.mock.calls[0] as unknown as
      | Parameters<BrowserSessionRuntime["executeApplicationFlow"]>
      | undefined;
    expect(executionCall?.[0]).toBe("target_site");
    expect(executionCall?.[1]).toMatchObject({
      mode: "prepare_only",
      accountCreationAuthorized: false,
      submitAuthorized: false,
    });
    expect(executionCall?.[2]?.signal).toBeInstanceOf(AbortSignal);
  });
  test("synthesizes an exact resumable checkpoint when a blocker omits runtime checkpoints", async () => {
    const seed = createSeed();
    seed.settings.resumeApplicationMode = "original_resume";
    seed.profile.baseResume.storagePath = "C:/tmp/alex-vanguard.pdf";
    const baseRuntime = createBrowserRuntime();
    let executionCount = 0;
    const executeApplicationFlow = vi.fn(
      async (
        source: Parameters<typeof baseRuntime.executeApplicationFlow>[0],
        input: Parameters<typeof baseRuntime.executeApplicationFlow>[1],
      ) => {
        executionCount += 1;
        const baseResult = await baseRuntime.executeApplicationFlow(
          source,
          input,
        );
        if (executionCount > 1) return baseResult;

        return ApplyExecutionResultSchema.parse({
          ...baseResult,
          state: "paused",
          summary: "Complete the CAPTCHA",
          detail: "The employer requires a browser-owned human check.",
          checkpoints: [],
          blocker: {
            code: "requires_manual_review",
            userActionKind: "captcha",
            summary: "Complete the CAPTCHA yourself.",
            url: input.job.applicationUrl ?? input.job.canonicalUrl,
          },
        });
      },
    );
    const harness = createWorkspaceServiceHarness({
      seed,
      browserRuntime: { ...baseRuntime, executeApplicationFlow },
    });

    const blocked =
      await harness.workspaceService.startApplyCopilotRun("job_ready");
    const request = blocked.userActionRequests[0];
    if (!request || request.scope.type !== "application") {
      throw new Error("Expected a resumable CAPTCHA action.");
    }
    const replayCheckpointId = request.scope.replayCheckpointId;
    const fallbackCheckpoint = (
      await harness.repository.listApplicationReplayCheckpoints()
    ).find((checkpoint) => checkpoint.id === replayCheckpointId);

    expect(request).toMatchObject({
      kind: "captcha",
      state: "pending",
      submitAuthorized: false,
      accountCreationAuthorized: false,
      scope: {
        runId: blocked.applyRuns[0]?.id,
        jobId: "job_ready",
        resultId: blocked.applyJobResults[0]?.id,
        replayCheckpointId: blocked.applyJobResults[0]?.latestCheckpointId,
      },
    });
    expect(fallbackCheckpoint).toMatchObject({
      label: "Browser action required",
      jobState: "awaiting_review",
    });

    const resumed = await harness.workspaceService.performUserAction({
      commandId: "confirm_fallback_checkpoint_captcha",
      requestId: request.id,
      expectedRevision: request.revision,
      action: "confirm_done",
    });

    expect(executeApplicationFlow).toHaveBeenCalledTimes(2);
    expect(executeApplicationFlow.mock.calls[1]?.[1]).toMatchObject({
      mode: "prepare_only",
      accountCreationAuthorized: false,
      submitAuthorized: false,
      recoveryContext: {
        previousRunId: request.scope.runId,
        previousResultId: request.scope.resultId,
        latestCheckpoint: {
          label: "Browser action required",
        },
      },
    });
    expect(resumed.userActionRequests[0]?.state).toBe("resolved");
  });

  test.each([
    ["login", "site_login_required", undefined],
    ["captcha", "requires_manual_review", "captcha"],
    ["manual_answer", "missing_candidate_answer", "manual_answer"],
    ["manual_upload", "missing_resume", "manual_upload"],
    ["legal_consent", "missing_consent", "legal_consent"],
  ] as const)(
    "keeps an empty-checkpoint %s blocker durably resumable",
    async (expectedKind, code, userActionKind) => {
      const seed = createSeed();
      seed.settings.resumeApplicationMode = "original_resume";
      seed.profile.baseResume.storagePath = "C:/tmp/alex-vanguard.pdf";
      const baseRuntime = createBrowserRuntime();
      const executeApplicationFlow = vi.fn(
        async (
          source: Parameters<typeof baseRuntime.executeApplicationFlow>[0],
          input: Parameters<typeof baseRuntime.executeApplicationFlow>[1],
        ) => {
          const baseResult = await baseRuntime.executeApplicationFlow(
            source,
            input,
          );
          return ApplyExecutionResultSchema.parse({
            ...baseResult,
            state: "paused",
            summary: "Browser action required",
            detail: "A browser-owned step needs the candidate.",
            checkpoints: [],
            blocker: {
              code,
              ...(userActionKind ? { userActionKind } : {}),
              summary: "Complete the browser-owned step.",
              questionIds:
                expectedKind === "manual_answer" ? ["question_required"] : [],
              url: input.job.applicationUrl ?? input.job.canonicalUrl,
            },
          });
        },
      );
      const harness = createWorkspaceServiceHarness({
        seed,
        browserRuntime: { ...baseRuntime, executeApplicationFlow },
      });

      const snapshot =
        await harness.workspaceService.startApplyCopilotRun("job_ready");
      const result = snapshot.applyJobResults[0];
      const request = snapshot.userActionRequests[0];
      const checkpoints =
        await harness.repository.listApplicationReplayCheckpoints();

      expect(result?.latestCheckpointId).toBeTruthy();
      expect(request).toMatchObject({
        kind: expectedKind,
        state: "pending",
        submitAuthorized: false,
        accountCreationAuthorized: false,
        scope: {
          type: "application",
          runId: snapshot.applyRuns[0]?.id,
          jobId: "job_ready",
          resultId: result?.id,
          replayCheckpointId: result?.latestCheckpointId,
        },
      });
      expect(
        checkpoints.find(
          (checkpoint) => checkpoint.id === result?.latestCheckpointId,
        ),
      ).toMatchObject({
        runId: snapshot.applyRuns[0]?.id,
        jobId: "job_ready",
        resultId: result?.id,
        label: "Browser action required",
      });
    },
  );

  test("rejects a submitted result reported through the prepare-only production path", async () => {
    const seed = createSeed();
    seed.settings.resumeApplicationMode = "original_resume";
    seed.profile.baseResume.storagePath = "C:/tmp/alex-vanguard.pdf";
    const baseRuntime = createBrowserRuntime();
    const executeApplicationFlow = vi.fn(
      async (
        source: Parameters<typeof baseRuntime.executeApplicationFlow>[0],
        input: Parameters<typeof baseRuntime.executeApplicationFlow>[1],
      ) => {
        const baseResult = await baseRuntime.executeApplicationFlow(
          source,
          input,
        );
        return ApplyExecutionResultSchema.parse({
          ...baseResult,
          state: "submitted",
          submittedAt: "2026-07-30T10:00:00.000Z",
          outcome: "submitted",
        });
      },
    );
    const harness = createWorkspaceServiceHarness({
      seed,
      browserRuntime: { ...baseRuntime, executeApplicationFlow },
    });

    await expect(
      harness.workspaceService.startApplyCopilotRun("job_ready"),
    ).rejects.toThrow(/without final-submit authorization/iu);
    expect(executeApplicationFlow).toHaveBeenCalledOnce();
    const executionCall = executeApplicationFlow.mock.calls[0] as unknown as
      | Parameters<BrowserSessionRuntime["executeApplicationFlow"]>
      | undefined;
    expect(executionCall?.[0]).toBe("target_site");
    expect(executionCall?.[1]).toMatchObject({
      mode: "prepare_only",
      accountCreationAuthorized: false,
      submitAuthorized: false,
    });
    expect(executionCall?.[2]?.signal).toBeInstanceOf(AbortSignal);
    expect(await harness.repository.listApplyRuns()).toEqual([
      expect.objectContaining({
        state: "failed",
        currentJobId: "job_ready",
        failedJobs: 1,
        submittedJobs: 0,
      }),
    ]);
    expect(await harness.repository.listApplyJobResults()).toEqual([
      expect.objectContaining({
        jobId: "job_ready",
        state: "failed",
        summary: "Application preparation failed.",
      }),
    ]);
  });

  test("keeps a two-job queue moving after the first job requests browser login", async () => {
    const seed = createSeed();
    seed.settings.resumeApplicationMode = "original_resume";
    seed.profile.baseResume.storagePath = "C:/tmp/alex-vanguard.pdf";
    const sourceJob = seed.savedJobs[0];
    if (!sourceJob) throw new Error("Expected a saved job fixture.");
    seed.savedJobs = [
      {
        ...sourceJob,
        id: "job_queue_login",
        sourceJobId: "queue_login",
        canonicalUrl: "https://www.linkedin.com/jobs/view/queue_login",
        applicationUrl: "https://www.linkedin.com/jobs/view/queue_login/apply",
        title: "Staff Product Designer",
      },
      {
        ...sourceJob,
        id: "job_queue_review",
        sourceJobId: "queue_review",
        canonicalUrl: "https://www.linkedin.com/jobs/view/queue_review",
        applicationUrl: "https://www.linkedin.com/jobs/view/queue_review/apply",
        title: "Principal Product Designer",
      },
    ];

    const baseRuntime = createBrowserRuntime();
    const executeApplicationFlow = vi.fn(
      async (
        source: Parameters<typeof baseRuntime.executeApplicationFlow>[0],
        input: Parameters<typeof baseRuntime.executeApplicationFlow>[1],
      ) => {
        const baseResult = await baseRuntime.executeApplicationFlow(
          source,
          input,
        );
        if (input.job.id !== "job_queue_login") {
          return baseResult;
        }

        return ApplyExecutionResultSchema.parse({
          ...baseResult,
          state: "paused",
          summary: "Sign in to continue",
          detail: "The application page requires a browser-owned session.",
          blocker: {
            code: "site_login_required",
            summary: "Sign in to continue",
            detail: "The application page requires a browser-owned session.",
            questionIds: [],
            sourceDebugEvidenceRefIds: [],
            url: input.job.applicationUrl ?? input.job.canonicalUrl,
          },
        });
      },
    );
    const harness = createWorkspaceServiceHarness({
      seed,
      browserRuntime: { ...baseRuntime, executeApplicationFlow },
    });

    const staged = await harness.workspaceService.startAutoApplyQueueRun([
      "job_queue_login",
      "job_queue_review",
    ]);
    const runId = staged.applyRuns.find((run) => run.mode === "queue_auto")?.id;
    if (!runId) throw new Error("Expected a staged queue run.");

    const snapshot = await harness.workspaceService.approveApplyRun(runId);
    const loginResult = snapshot.applyJobResults.find(
      (result) => result.runId === runId && result.jobId === "job_queue_login",
    );
    const reviewResult = snapshot.applyJobResults.find(
      (result) => result.runId === runId && result.jobId === "job_queue_review",
    );
    const applicationRequests = snapshot.userActionRequests.filter(
      (request) => request.scope.type === "application",
    );

    expect(
      executeApplicationFlow.mock.calls.map(([, input]) => ({
        jobId: input.job.id,
        mode: input.mode,
        accountCreationAuthorized: input.accountCreationAuthorized,
        submitAuthorized: input.submitAuthorized,
      })),
    ).toEqual([
      {
        jobId: "job_queue_login",
        mode: "prepare_only",
        accountCreationAuthorized: false,
        submitAuthorized: false,
      },
      {
        jobId: "job_queue_review",
        mode: "prepare_only",
        accountCreationAuthorized: false,
        submitAuthorized: false,
      },
    ]);
    expect(loginResult).toMatchObject({
      state: "awaiting_review",
      blockerReason: "auth_required",
    });
    expect(loginResult?.latestCheckpointId).toBeTruthy();
    expect(reviewResult).toMatchObject({
      state: "awaiting_review",
      blockerReason: null,
    });
    expect(applicationRequests).toEqual([
      expect.objectContaining({
        kind: "login",
        state: "pending",
        scope: {
          type: "application",
          runId,
          jobId: "job_queue_login",
          applicationRecordId: loginResult?.applicationRecordId,
          resultId: loginResult?.id,
          replayCheckpointId: loginResult?.latestCheckpointId,
          source: "target_site",
        },
        submitAuthorized: false,
        accountCreationAuthorized: false,
      }),
    ]);
  });
  test("does not create a login action for a non-login application blocker", async () => {
    const harness = createWorkspaceServiceHarness({ seed: createSeed() });
    const job = (await harness.repository.listSavedJobs())[0];
    if (!job) throw new Error("Expected a saved job fixture.");

    await persistApplicationUserAction({
      repository: harness.repository,
      applicationRecordId: `application_${job.id}`,
      job,
      runId: "apply_run_manual",
      resultId: "apply_result_manual",
      replayCheckpointId: null,
      blocker: ApplicationAttemptBlockerSchema.parse({
        code: "requires_manual_review",
        summary: "Review a required answer.",
        detail: "A manual answer is required.",
        questionIds: ["question_1"],
        sourceDebugEvidenceRefIds: [],
        url: job.applicationUrl,
      }),
      occurredAt: "2026-07-30T10:00:00.000Z",
    });

    expect(await harness.repository.listUserActionRequests()).toEqual([]);
  });
  test("lets two WorkspaceService instances share one durable resumption execution", async () => {
    const seed = createSeed();
    seed.settings.resumeApplicationMode = "original_resume";
    seed.profile.baseResume.storagePath = "C:/tmp/alex-vanguard.pdf";
    const baseRuntime = createBrowserRuntime();
    let executionCount = 0;
    let markRetryStarted: () => void = () => undefined;
    let releaseRetry: () => void = () => undefined;
    const retryStarted = new Promise<void>((resolve) => {
      markRetryStarted = resolve;
    });
    const retryRelease = new Promise<void>((resolve) => {
      releaseRetry = resolve;
    });
    const executeApplicationFlow = vi.fn(
      async (
        source: Parameters<typeof baseRuntime.executeApplicationFlow>[0],
        input: Parameters<typeof baseRuntime.executeApplicationFlow>[1],
      ) => {
        executionCount += 1;
        const baseResult = await baseRuntime.executeApplicationFlow(
          source,
          input,
        );
        if (executionCount === 1) {
          return ApplyExecutionResultSchema.parse({
            ...baseResult,
            state: "paused",
            summary: "Sign in to continue",
            detail: "The application page requires a browser-owned session.",
            blocker: {
              code: "site_login_required",
              summary: "Sign in to continue",
              detail: "The application page requires a browser-owned session.",
              questionIds: [],
              sourceDebugEvidenceRefIds: [],
              url: input.job.applicationUrl ?? input.job.canonicalUrl,
            },
          });
        }
        markRetryStarted();
        await retryRelease;
        return baseResult;
      },
    );
    const inspectSourceAccess = vi.fn(() =>
      Promise.resolve({
        state: "authenticated" as const,
        currentOrigin: "https://www.linkedin.com/",
        checkedAt: "2026-07-30T10:30:00.000Z",
        signals: ["account_menu_control" as const],
      }),
    );
    const harness = createWorkspaceServiceHarness({
      seed,
      browserRuntime: {
        ...baseRuntime,
        executeApplicationFlow,
        inspectSourceAccess,
      },
    });

    const blocked =
      await harness.workspaceService.startApplyCopilotRun("job_ready");
    const request = blocked.userActionRequests[0];
    if (!request || request.scope.type !== "application") {
      throw new Error("Expected an application login request.");
    }

    const concurrentService = createJobFinderWorkspaceService({
      repository: harness.repository,
      browserRuntime: {
        ...baseRuntime,
        executeApplicationFlow,
        inspectSourceAccess,
      },
      aiClient: harness.aiClient,
      documentManager: harness.documentManager,
      exportFileVerifier: harness.exportFileVerifier,
      researchAdapter: harness.researchAdapter,
    });
    const resumedPromise = harness.workspaceService.performUserAction({
      commandId: "confirm_application_login",
      requestId: request.id,
      expectedRevision: request.revision,
      action: "confirm_done",
    });
    await retryStarted;
    const concurrentSnapshot = await concurrentService.performUserAction({
      commandId: "confirm_application_login_duplicate",
      requestId: request.id,
      expectedRevision: request.revision,
      action: "confirm_done",
    });
    releaseRetry();
    const resumed = await resumedPromise;

    expect(concurrentSnapshot.userActionRequests[0]?.state).toBe("resolved");
    expect(inspectSourceAccess).toHaveBeenCalledTimes(1);
    expect(executeApplicationFlow).toHaveBeenCalledTimes(2);
    const retryInput = executeApplicationFlow.mock.calls[1]?.[1];
    expect(retryInput?.mode).toBe("prepare_only");
    expect(retryInput?.idempotencyKey).toContain(request.id);
    expect(retryInput?.accountCreationAuthorized).toBe(false);
    expect(retryInput?.submitAuthorized).toBe(false);
    expect(resumed.userActionRequests[0]?.state).toBe("resolved");
    expect(resumed.applyJobResults[0]?.jobId).toBe(request.scope.jobId);
    expect(resumed.applyJobResults[0]?.lastUserActionResumptionId).toContain(
      request.id,
    );
    const resumptionAttempt = resumed.applicationAttempts.find(
      (attempt) => attempt.userActionResumption?.requestId === request.id,
    );
    expect(resumptionAttempt?.completedAt).toBeTruthy();
    expect(resumptionAttempt?.userActionResumption).toEqual({
      requestId: request.id,
      requestRevision: 3,
      verificationEventId: `verification:${request.id}:r2`,
      runId: request.scope.runId,
      jobId: request.scope.jobId,
      resultId: request.scope.resultId,
      replayCheckpointId: request.scope.replayCheckpointId,
    });
    expect(
      executeApplicationFlow.mock.calls.every(
        ([, input]) =>
          input.mode === "prepare_only" && input.submitAuthorized === false,
      ),
    ).toBe(true);

    if (!resumptionAttempt) {
      throw new Error("Expected a completed resumption attempt.");
    }
    await harness.repository.upsertApplicationAttempt({
      ...resumptionAttempt,
      completedAt: null,
    });
    const restartExecuteApplicationFlow = vi.fn(
      (
        source: Parameters<typeof baseRuntime.executeApplicationFlow>[0],
        input: Parameters<typeof baseRuntime.executeApplicationFlow>[1],
      ) => baseRuntime.executeApplicationFlow(source, input),
    );
    const restartedService = createJobFinderWorkspaceService({
      repository: harness.repository,
      browserRuntime: {
        ...baseRuntime,
        executeApplicationFlow: restartExecuteApplicationFlow,
        inspectSourceAccess,
      },
      aiClient: harness.aiClient,
      documentManager: harness.documentManager,
      exportFileVerifier: harness.exportFileVerifier,
      researchAdapter: harness.researchAdapter,
    });

    const recovered = await restartedService.getWorkspaceSnapshot();
    const recoveredAttempt = recovered.applicationAttempts.find(
      (attempt) => attempt.id === resumptionAttempt.id,
    );
    expect(restartExecuteApplicationFlow).not.toHaveBeenCalled();
    expect(recoveredAttempt?.completedAt).toBeTruthy();
    expect(recoveredAttempt?.checkpoints).toEqual(
      resumptionAttempt.checkpoints,
    );
    expect(recoveredAttempt?.questions).toEqual(resumptionAttempt.questions);
  });

  test("does not overwrite a concurrently changed result after browser execution", async () => {
    const seed = createSeed();
    seed.settings.resumeApplicationMode = "original_resume";
    seed.profile.baseResume.storagePath = "C:/tmp/alex-vanguard.pdf";
    const baseRuntime = createBrowserRuntime();
    let executionCount = 0;
    let markRetryStarted: () => void = () => undefined;
    let releaseRetry: () => void = () => undefined;
    const retryStarted = new Promise<void>((resolve) => {
      markRetryStarted = resolve;
    });
    const retryRelease = new Promise<void>((resolve) => {
      releaseRetry = resolve;
    });
    const executeApplicationFlow = vi.fn(
      async (
        source: Parameters<typeof baseRuntime.executeApplicationFlow>[0],
        input: Parameters<typeof baseRuntime.executeApplicationFlow>[1],
      ) => {
        executionCount += 1;
        const baseResult = await baseRuntime.executeApplicationFlow(
          source,
          input,
        );
        if (executionCount === 1) {
          return ApplyExecutionResultSchema.parse({
            ...baseResult,
            state: "paused",
            summary: "Sign in to continue",
            detail: "The application page requires a browser-owned session.",
            blocker: {
              code: "site_login_required",
              summary: "Sign in to continue",
              detail: "The application page requires a browser-owned session.",
              url: input.job.applicationUrl ?? input.job.canonicalUrl,
            },
          });
        }
        markRetryStarted();
        await retryRelease;
        return baseResult;
      },
    );
    const harness = createWorkspaceServiceHarness({
      seed,
      browserRuntime: {
        ...baseRuntime,
        executeApplicationFlow,
        inspectSourceAccess: () =>
          Promise.resolve({
            state: "authenticated" as const,
            currentOrigin: "https://www.linkedin.com/",
            checkedAt: "2026-07-30T10:30:00.000Z",
            signals: ["account_menu_control" as const],
          }),
      },
    });

    const blocked =
      await harness.workspaceService.startApplyCopilotRun("job_ready");
    const request = blocked.userActionRequests[0];
    if (!request) throw new Error("Expected an application login request.");

    const resume = harness.workspaceService.performUserAction({
      commandId: "confirm_application_login_with_concurrent_result",
      requestId: request.id,
      expectedRevision: request.revision,
      action: "confirm_done",
    });
    await retryStarted;

    const currentResult = (await harness.repository.listApplyJobResults())[0];
    if (!currentResult) throw new Error("Expected an apply result.");
    await harness.repository.upsertApplyJobResult({
      ...currentResult,
      summary: "Concurrent owner preserved this result",
      detail: "A separate flow updated this result while resumption ran.",
      updatedAt: "2099-01-01T00:00:00.000Z",
    });
    releaseRetry();
    const snapshot = await resume;

    expect(executeApplicationFlow).toHaveBeenCalledTimes(2);
    expect(snapshot.applyJobResults[0]).toMatchObject({
      summary: "Concurrent owner preserved this result",
      detail: "A separate flow updated this result while resumption ran.",
    });
    expect(
      snapshot.applyJobResults[0]?.lastUserActionResumptionId,
    ).toBeUndefined();
    expect(
      snapshot.applicationAttempts.find(
        (attempt) => attempt.userActionResumption?.requestId === request.id,
      ),
    ).toMatchObject({
      state: "unsupported",
      summary:
        "Application retry result was not saved because the result changed",
    });
  });
  test("does not execute when the verified checkpoint lineage became stale", async () => {
    const seed = createSeed();
    seed.settings.resumeApplicationMode = "original_resume";
    seed.profile.baseResume.storagePath = "C:/tmp/alex-vanguard.pdf";
    const baseRuntime = createBrowserRuntime();
    const executeApplicationFlow = vi.fn(
      async (
        source: Parameters<typeof baseRuntime.executeApplicationFlow>[0],
        input: Parameters<typeof baseRuntime.executeApplicationFlow>[1],
      ) => {
        const baseResult = await baseRuntime.executeApplicationFlow(
          source,
          input,
        );
        return ApplyExecutionResultSchema.parse({
          ...baseResult,
          state: "paused",
          summary: "Sign in to continue",
          detail: "The application page requires a browser-owned session.",
          blocker: {
            code: "site_login_required",
            summary: "Sign in to continue",
            detail: "The application page requires a browser-owned session.",
            questionIds: [],
            sourceDebugEvidenceRefIds: [],
            url: input.job.applicationUrl ?? input.job.canonicalUrl,
          },
        });
      },
    );
    const harness = createWorkspaceServiceHarness({
      seed,
      browserRuntime: {
        ...baseRuntime,
        executeApplicationFlow,
        inspectSourceAccess: vi.fn(() =>
          Promise.resolve({
            state: "authenticated" as const,
            currentOrigin: "https://www.linkedin.com/",
            checkedAt: "2026-07-30T10:30:00.000Z",
            signals: ["account_menu_control" as const],
          }),
        ),
      },
    });

    const blocked =
      await harness.workspaceService.startApplyCopilotRun("job_ready");
    const request = blocked.userActionRequests[0];
    const result = blocked.applyJobResults[0];
    if (!request || request.scope.type !== "application" || !result) {
      throw new Error("Expected an application login lineage.");
    }
    await harness.repository.upsertApplyJobResult({
      ...result,
      latestCheckpointId: "checkpoint_replaced_elsewhere",
      updatedAt: "2026-07-30T11:00:00.000Z",
    });

    const snapshot = await harness.workspaceService.performUserAction({
      commandId: "confirm_stale_application_login",
      requestId: request.id,
      expectedRevision: request.revision,
      action: "confirm_done",
    });

    expect(executeApplicationFlow).toHaveBeenCalledTimes(1);
    expect(snapshot.applicationAttempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          state: "unsupported",
          summary: "Application retry skipped because its checkpoint changed",
        }),
      ]),
    );
    expect(snapshot.applyJobResults[0]?.latestCheckpointId).toBe(
      "checkpoint_replaced_elsewhere",
    );
  });

  test("retries with the exact persisted manual answer and remains restart-idempotent", async () => {
    const seed = createSeed();
    seed.settings.resumeApplicationMode = "original_resume";
    seed.profile.baseResume.storagePath = "C:/tmp/alex-vanguard.pdf";
    const baseRuntime = createBrowserRuntime();
    let executionCount = 0;
    const executeApplicationFlow = vi.fn(
      async (
        source: Parameters<typeof baseRuntime.executeApplicationFlow>[0],
        input: Parameters<typeof baseRuntime.executeApplicationFlow>[1],
      ) => {
        executionCount += 1;
        const baseResult = await baseRuntime.executeApplicationFlow(
          source,
          input,
        );
        return executionCount === 1
          ? ApplyExecutionResultSchema.parse({
              ...baseResult,
              state: "paused",
              summary: "A required answer needs you",
              detail: "Answer this question in the browser.",
              questions: [
                {
                  id: "question_work_authorization",
                  prompt: "Are you authorized to work in this location?",
                  kind: "work_authorization",
                  answerControlType: "text",
                  isRequired: true,
                  detectedAt: "2026-07-30T10:00:00.000Z",
                  answerOptions: [],
                  suggestedAnswers: [],
                  submittedAnswer: null,
                  status: "detected",
                },
              ],
              blocker: {
                code: "missing_candidate_answer",
                userActionKind: "manual_answer",
                summary: "Answer the work authorization question.",
                detail: "The answer stays in the browser.",
                questionIds: ["question_work_authorization"],
                sourceDebugEvidenceRefIds: [],
                url: input.job.applicationUrl ?? input.job.canonicalUrl,
              },
            })
          : baseResult;
      },
    );
    const harness = createWorkspaceServiceHarness({
      seed,
      browserRuntime: { ...baseRuntime, executeApplicationFlow },
    });

    const blocked =
      await harness.workspaceService.startApplyCopilotRun("job_ready");
    const request = blocked.userActionRequests[0];
    if (
      !request ||
      request.scope.type !== "application" ||
      !request.scope.applicationRecordId
    ) {
      throw new Error("Expected a manual application action.");
    }

    const resumed = await harness.workspaceService.performUserAction({
      commandId: "submit_manual_answer_complete",
      requestId: request.id,
      expectedRevision: request.revision,
      action: "submit_manual_answer",
      answer: "Yes, I am authorized to work in this location.",
      saveForFuture: false,
      credentialsPolicy: "browser_only",
      submitAuthorized: false,
      accountCreationAuthorized: false,
    });

    expect(request.kind).toBe("manual_answer");
    expect(request.verification.type).toBe("page_blocker_absent");
    expect(executeApplicationFlow).toHaveBeenCalledTimes(2);
    expect(executeApplicationFlow.mock.calls[1]?.[1]).toMatchObject({
      mode: "prepare_only",
      accountCreationAuthorized: false,
      submitAuthorized: false,
    });
    expect(
      executeApplicationFlow.mock.calls[1]?.[1].profile.answerBank
        .customAnswers,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          answer: "Yes, I am authorized to work in this location.",
        }),
      ]),
    );
    expect(
      await harness.repository.listApplicationAnswerRecords({
        applicationRecordId: request.scope.applicationRecordId,
      }),
    ).toEqual([
      expect.objectContaining({
        applicationRecordId: request.scope.applicationRecordId,
        resultId: request.scope.resultId,
        sourceId: request.id,
        text: "Yes, I am authorized to work in this location.",
      }),
    ]);
    expect(resumed.userActionRequests[0]?.state).toBe("resolved");
    expect(resumed.applyJobResults[0]?.lastUserActionResumptionId).toContain(
      request.id,
    );

    const restartExecuteApplicationFlow = vi.fn(
      baseRuntime.executeApplicationFlow.bind(baseRuntime),
    );
    const restartedService = createJobFinderWorkspaceService({
      repository: harness.repository,
      browserRuntime: {
        ...baseRuntime,
        executeApplicationFlow: restartExecuteApplicationFlow,
      },
      aiClient: harness.aiClient,
      documentManager: harness.documentManager,
      exportFileVerifier: harness.exportFileVerifier,
      researchAdapter: harness.researchAdapter,
    });
    const restarted = await restartedService.getWorkspaceSnapshot();
    expect(restartExecuteApplicationFlow).not.toHaveBeenCalled();
    expect(restarted.userActionRequests[0]?.state).toBe("resolved");
  });

  test("keeps the action blocked when the same stable blocker rerenders with different prose", async () => {
    const seed = createSeed();
    seed.settings.resumeApplicationMode = "original_resume";
    seed.profile.baseResume.storagePath = "C:/tmp/alex-vanguard.pdf";
    const baseRuntime = createBrowserRuntime();
    let executionCount = 0;
    const executeApplicationFlow = vi.fn(
      async (
        source: Parameters<typeof baseRuntime.executeApplicationFlow>[0],
        input: Parameters<typeof baseRuntime.executeApplicationFlow>[1],
      ) => {
        executionCount += 1;
        const baseResult = await baseRuntime.executeApplicationFlow(
          source,
          input,
        );
        return ApplyExecutionResultSchema.parse({
          ...baseResult,
          state: "paused",
          summary:
            executionCount === 1
              ? "A required answer needs you"
              : "The required answer is still missing",
          detail:
            executionCount === 1
              ? "Answer this question in the browser."
              : "The page rerendered with new explanatory text.",
          blocker: {
            code: "missing_candidate_answer",
            userActionKind: "manual_answer",
            summary:
              executionCount === 1
                ? "Answer the work authorization question."
                : "Work authorization still requires an answer.",
            detail: `Browser-only wording revision ${executionCount}.`,
            questionIds: ["question_work_authorization"],
            sourceDebugEvidenceRefIds: [`evidence_${executionCount}`],
            url: `${input.job.applicationUrl ?? input.job.canonicalUrl}?render=${executionCount}`,
          },
        });
      },
    );
    const harness = createWorkspaceServiceHarness({
      seed,
      browserRuntime: { ...baseRuntime, executeApplicationFlow },
    });

    const blocked =
      await harness.workspaceService.startApplyCopilotRun("job_ready");
    const request = blocked.userActionRequests[0];
    if (!request) throw new Error("Expected a manual application action.");

    const checked = await harness.workspaceService.performUserAction({
      commandId: "confirm_manual_answer_still_blocked",
      requestId: request.id,
      expectedRevision: request.revision,
      action: "confirm_done",
    });

    expect(executeApplicationFlow).toHaveBeenCalledTimes(2);
    expect(checked.userActionRequests[0]?.state).toBe("still_blocked");
    expect(checked.applyJobResults[0]?.lastUserActionResumptionId).toBeFalsy();
    expect(
      checked.applicationAttempts.find(
        (attempt) => attempt.userActionResumption?.requestId === request.id,
      ),
    ).toMatchObject({
      summary: "Browser step is still blocking this application",
    });
  });

  test("resolves the exact blocker and persists a newly encountered application blocker", async () => {
    const seed = createSeed();
    seed.settings.resumeApplicationMode = "original_resume";
    seed.profile.baseResume.storagePath = "C:/tmp/alex-vanguard.pdf";
    const baseRuntime = createBrowserRuntime();
    let executionCount = 0;
    const executeApplicationFlow = vi.fn(
      async (
        source: Parameters<typeof baseRuntime.executeApplicationFlow>[0],
        input: Parameters<typeof baseRuntime.executeApplicationFlow>[1],
      ) => {
        executionCount += 1;
        const baseResult = await baseRuntime.executeApplicationFlow(
          source,
          input,
        );
        const first = executionCount === 1;
        return ApplyExecutionResultSchema.parse({
          ...baseResult,
          state: "paused",
          summary: first
            ? "A required answer needs you"
            : "A file upload now needs you",
          detail: first
            ? "Answer this question in the browser."
            : "Attach the requested file in the browser.",
          blocker: first
            ? {
                code: "missing_candidate_answer",
                userActionKind: "manual_answer",
                summary: "Answer the work authorization question.",
                questionIds: ["question_work_authorization"],
                url: input.job.applicationUrl ?? input.job.canonicalUrl,
              }
            : {
                code: "missing_resume",
                userActionKind: "manual_upload",
                summary: "Attach the required resume file.",
                questionIds: [],
                url: `${input.job.applicationUrl ?? input.job.canonicalUrl}/upload`,
              },
        });
      },
    );
    const harness = createWorkspaceServiceHarness({
      seed,
      browserRuntime: { ...baseRuntime, executeApplicationFlow },
    });

    const blocked =
      await harness.workspaceService.startApplyCopilotRun("job_ready");
    const firstRequest = blocked.userActionRequests[0];
    if (!firstRequest) throw new Error("Expected a manual application action.");

    const resumed = await harness.workspaceService.performUserAction({
      commandId: "confirm_manual_answer_reveals_upload",
      requestId: firstRequest.id,
      expectedRevision: firstRequest.revision,
      action: "confirm_done",
    });

    expect(executeApplicationFlow).toHaveBeenCalledTimes(2);
    expect(resumed.userActionRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: firstRequest.id,
          kind: "manual_answer",
          state: "resolved",
        }),
        expect.objectContaining({
          kind: "manual_upload",
          state: "pending",
        }),
      ]),
    );
    const nextRequest = resumed.userActionRequests.find(
      (request) => request.kind === "manual_upload",
    );
    expect(nextRequest?.verification.type).toBe("page_blocker_absent");
    expect(resumed.applyJobResults[0]?.lastUserActionResumptionId).toContain(
      firstRequest.id,
    );
  });

  test("keeps a prepare-only action blocked when its exact checkpoint lineage is stale", async () => {
    const seed = createSeed();
    seed.settings.resumeApplicationMode = "original_resume";
    seed.profile.baseResume.storagePath = "C:/tmp/alex-vanguard.pdf";
    const baseRuntime = createBrowserRuntime();
    const executeApplicationFlow = vi.fn(
      async (
        source: Parameters<typeof baseRuntime.executeApplicationFlow>[0],
        input: Parameters<typeof baseRuntime.executeApplicationFlow>[1],
      ) => {
        const baseResult = await baseRuntime.executeApplicationFlow(
          source,
          input,
        );
        return ApplyExecutionResultSchema.parse({
          ...baseResult,
          state: "paused",
          summary: "A required answer needs you",
          detail: "Answer this question in the browser.",
          blocker: {
            code: "missing_candidate_answer",
            userActionKind: "manual_answer",
            summary: "Answer the work authorization question.",
            questionIds: ["question_work_authorization"],
            url: input.job.applicationUrl ?? input.job.canonicalUrl,
          },
        });
      },
    );
    const harness = createWorkspaceServiceHarness({
      seed,
      browserRuntime: { ...baseRuntime, executeApplicationFlow },
    });

    const blocked =
      await harness.workspaceService.startApplyCopilotRun("job_ready");
    const request = blocked.userActionRequests[0];
    const result = blocked.applyJobResults[0];
    if (!request || !result) {
      throw new Error("Expected a manual application lineage.");
    }
    await harness.repository.upsertApplyJobResult({
      ...result,
      latestCheckpointId: "checkpoint_replaced_before_manual_retry",
      updatedAt: "2026-07-30T11:00:00.000Z",
    });

    const checked = await harness.workspaceService.performUserAction({
      commandId: "confirm_manual_answer_with_stale_checkpoint",
      requestId: request.id,
      expectedRevision: request.revision,
      action: "confirm_done",
    });

    expect(executeApplicationFlow).toHaveBeenCalledTimes(1);
    expect(checked.userActionRequests[0]?.state).toBe("still_blocked");
    expect(checked.applyJobResults[0]?.latestCheckpointId).toBe(
      "checkpoint_replaced_before_manual_retry",
    );
    expect(
      checked.applicationAttempts.find(
        (attempt) => attempt.userActionResumption?.requestId === request.id,
      ),
    ).toMatchObject({
      state: "unsupported",
      summary: "Application retry skipped because its checkpoint changed",
    });
  });
});
