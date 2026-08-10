import type { DiscoveryActivityEvent } from "@unemployed/contracts";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  createSeed,
  createWorkspaceServiceHarness,
} from "./workspace-service.test-support";

interface Deferred<TValue> {
  promise: Promise<TValue>;
  resolve(value: TValue): void;
}

function createDeferred<TValue>(): Deferred<TValue> {
  let resolvePromise: ((value: TValue) => void) | null = null;
  const promise = new Promise<TValue>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(value) {
      if (!resolvePromise) {
        throw new Error("Deferred promise was not initialized.");
      }
      resolvePromise(value);
    },
  };
}

function createGreenhouseResponse(input: {
  id: number;
  title: string;
  board: string;
}): Response {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        jobs: [
          {
            id: input.id,
            title: input.title,
            absolute_url: `https://job-boards.greenhouse.io/${input.board}/jobs/${input.id}`,
            location: { name: "Remote" },
            updated_at: "2026-08-09T10:00:00.000Z",
            content:
              "<p>Lead product design systems and resilient workflow platforms.</p>",
          },
        ],
      }),
  } as Response;
}

function createFailedResponse(status: number): Response {
  return {
    ok: false,
    status,
  } as Response;
}

function resolveRequestUrl(request: RequestInfo | URL): string {
  if (typeof request === "string") {
    return request;
  }
  if (request instanceof URL) {
    return request.toString();
  }
  return request.url;
}

function createProgressiveApiHarness() {
  const seed = createSeed();
  seed.savedJobs = [];
  seed.discovery.pendingDiscoveryJobs = [];
  seed.discovery.discoveryLedger = [];
  seed.settings.discoveryOnly = false;
  seed.searchPreferences.companyWhitelist = [];
  seed.searchPreferences.targetRoles = ["Senior Product Designer"];
  seed.searchPreferences.discovery.targets = [
    {
      id: "target_slow_api",
      label: "Slow Board",
      startingUrl: "https://job-boards.greenhouse.io/slowboard",
      enabled: true,
      adapterKind: "auto",
      customInstructions: null,
      instructionStatus: "missing",
      validatedInstructionId: null,
      draftInstructionId: null,
      lastDebugRunId: null,
      lastVerifiedAt: null,
      staleReason: null,
    },
    {
      id: "target_fast_api",
      label: "Fast Board",
      startingUrl: "https://job-boards.greenhouse.io/fastboard",
      enabled: true,
      adapterKind: "auto",
      customInstructions: null,
      instructionStatus: "missing",
      validatedInstructionId: null,
      draftInstructionId: null,
      lastDebugRunId: null,
      lastVerifiedAt: null,
      staleReason: null,
    },
  ];

  return createWorkspaceServiceHarness({ seed });
}

function completedTargetIds(
  events: readonly DiscoveryActivityEvent[],
): string[] {
  return events.flatMap((event) =>
    event.stage === "target" &&
    event.terminalState === "completed" &&
    event.targetId
      ? [event.targetId]
      : [],
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("progressive public API discovery", () => {
  test("publishes a fast later API source while the first API source is still pending", async () => {
    const slowResponse = createDeferred<Response>();
    vi.spyOn(globalThis, "fetch").mockImplementation((request) => {
      const url = resolveRequestUrl(request);
      if (url.includes("slowboard")) {
        return slowResponse.promise;
      }
      if (url.includes("fastboard")) {
        return Promise.resolve(
          createGreenhouseResponse({
            id: 2002,
            title: "Senior Product Designer - Fast",
            board: "fastboard",
          }),
        );
      }
      throw new Error(`Unexpected provider request: ${url}`);
    });
    const { repository, workspaceService } = createProgressiveApiHarness();
    const events: DiscoveryActivityEvent[] = [];
    let runSettled = false;

    const runPromise = workspaceService
      .runAgentDiscovery((event) => events.push(event))
      .finally(() => {
        runSettled = true;
      });

    await vi.waitFor(() => {
      expect(completedTargetIds(events)).toEqual(["target_fast_api"]);
    });
    expect(runSettled).toBe(false);
    expect(
      (await repository.listSavedJobs()).map((job) => job.sourceJobId),
    ).toContain("2002");

    slowResponse.resolve(
      createGreenhouseResponse({
        id: 1001,
        title: "Senior Product Designer - Slow",
        board: "slowboard",
      }),
    );
    const snapshot = await runPromise;

    expect(completedTargetIds(events)).toEqual([
      "target_fast_api",
      "target_slow_api",
    ]);
    expect(snapshot.discoveryJobs.map((job) => job.sourceJobId)).toEqual(
      expect.arrayContaining(["1001", "2002"]),
    );
    expect(snapshot.recentDiscoveryRuns[0]?.summary).toMatchObject({
      targetsCompleted: 2,
      jobsPersisted: 2,
      outcome: "completed",
    });
  });

  test("keeps a completed fast batch durable when a slower provider later fails", async () => {
    const slowResponse = createDeferred<Response>();
    vi.spyOn(globalThis, "fetch").mockImplementation((request) => {
      const url = resolveRequestUrl(request);
      if (url.includes("slowboard")) {
        return slowResponse.promise;
      }
      if (url.includes("fastboard")) {
        return Promise.resolve(
          createGreenhouseResponse({
            id: 3003,
            title: "Senior Product Designer - Durable",
            board: "fastboard",
          }),
        );
      }
      throw new Error(`Unexpected provider request: ${url}`);
    });
    const { repository, workspaceService } = createProgressiveApiHarness();
    const events: DiscoveryActivityEvent[] = [];
    const runPromise = workspaceService.runAgentDiscovery((event) =>
      events.push(event),
    );

    await vi.waitFor(() => {
      expect(completedTargetIds(events)).toEqual(["target_fast_api"]);
    });
    expect(
      (await repository.listSavedJobs()).map((job) => job.sourceJobId),
    ).toContain("3003");

    slowResponse.resolve(createFailedResponse(503));
    const snapshot = await runPromise;
    const run = snapshot.recentDiscoveryRuns[0];
    const slowExecution = run?.targetExecutions.find(
      (execution) => execution.targetId === "target_slow_api",
    );

    expect(snapshot.discoveryJobs.map((job) => job.sourceJobId)).toContain(
      "3003",
    );
    expect(slowExecution).toMatchObject({
      state: "completed",
      jobsPersisted: 0,
    });
    expect(slowExecution?.warning).toMatch(/returned 503/i);
    expect(run?.summary).toMatchObject({
      targetsCompleted: 2,
      jobsPersisted: 1,
      outcome: "completed",
    });
  });

  test("cancels promptly while every prefetched API inventory is pending", async () => {
    const slowResponse = createDeferred<Response>();
    const fastResponse = createDeferred<Response>();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((request) =>
        resolveRequestUrl(request).includes("slowboard")
          ? slowResponse.promise
          : fastResponse.promise,
      );
    const { workspaceService } = createProgressiveApiHarness();
    const controller = new AbortController();
    const runPromise = workspaceService.runAgentDiscovery(
      undefined,
      controller.signal,
    );

    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
    controller.abort();
    const snapshot = await runPromise;

    expect(snapshot.recentDiscoveryRuns[0]?.summary).toMatchObject({
      targetsCompleted: 0,
      jobsPersisted: 0,
      outcome: "cancelled",
    });

    slowResponse.resolve(
      createGreenhouseResponse({
        id: 4004,
        title: "Senior Product Designer - Cancelled Slow",
        board: "slowboard",
      }),
    );
    fastResponse.resolve(
      createGreenhouseResponse({
        id: 5005,
        title: "Senior Product Designer - Cancelled Fast",
        board: "fastboard",
      }),
    );
  });
});
