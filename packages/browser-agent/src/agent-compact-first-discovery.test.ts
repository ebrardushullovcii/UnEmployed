import { describe, expect, test, vi } from "vitest";
import type { Page } from "playwright";
import type { BrowserAgentRunCheckpoint } from "@unemployed/contracts";
import { runAgentDiscovery, type JobExtractor, type LLMClient } from "./agent";
import { createConfig, createToolCall } from "./agent.test-fixtures";
import type { AgentMessage } from "./types";

// ---------------------------------------------------------------------------
// Structural fakes: no browser. The fake Page implements exactly the surface
// this slice touches: goto/url/title/locator("body")/evaluate. The evaluate
// fake recognizes the deterministic compact scanner by its stable function
// name and returns detached scan payloads, mirroring the observer's own
// browser-free test approach.
// ---------------------------------------------------------------------------

const COMPACT_SCANNER_FN_NAME = "compactDiscoveryInPageScan";

interface FakeScanPayload {
  structuredPostings?: Array<Record<string, unknown>>;
  cardContainers?: Array<Record<string, unknown>>;
  elements?: Array<{
    role?: string;
    accessibleName?: string;
    href?: string | null;
    containerKey?: string | null;
    jobIdHint?: string | null;
    companyHref?: string | null;
    companyLabel?: string | null;
  }>;
}

interface FakePageOptions {
  scanPayload?: FakeScanPayload | null;
  bodyText?: string;
  snapshot?: string;
  url?: string;
  onEvaluate?: () => void;
}

function createCompactFirstFakePage(options: FakePageOptions = {}): Page {
  const landingUrl = options.url ?? "https://www.linkedin.com/jobs/search/";
  const bodyLocator = {
    async innerText() {
      return (
        options.bodyText ??
        "Primary target search page with visible job listing content."
      );
    },
    ...(options.snapshot === undefined
      ? {}
      : { ariaSnapshot: async () => options.snapshot ?? "" }),
  };

  return {
    async goto() {
      return null as never;
    },
    url: () => landingUrl,
    async title() {
      return "Primary target";
    },
    locator(selector: string) {
      if (selector !== "body") {
        throw new Error(`Unexpected locator in fake page: ${selector}`);
      }
      return bodyLocator;
    },
    async evaluate(fn: unknown) {
      options.onEvaluate?.();
      if (
        typeof fn === "function" &&
        String(fn).includes(COMPACT_SCANNER_FN_NAME)
      ) {
        if (options.scanPayload === undefined || options.scanPayload === null) {
          return null;
        }
        return {
          structuredPostings: options.scanPayload.structuredPostings ?? [],
          cardContainers: options.scanPayload.cardContainers ?? [],
          elements: options.scanPayload.elements ?? [],
        };
      }
      return [];
    },
  } as unknown as Page;
}

function createOrdinaryConfig(overrides?: { targetJobCount?: number }) {
  const config = createConfig();
  // Ordinary discovery run: no taskPacket, so no explicit source-debug finish.
  config.promptContext = { siteLabel: "Primary target" };
  if (overrides?.targetJobCount !== undefined) {
    config.targetJobCount = overrides.targetJobCount;
  }
  return config;
}

type JournalEntry =
  | { kind: "checkpoint"; revision: number }
  | { kind: "progress"; action?: string; message?: string | null };

function extractCompactSummaryJsonLine(
  reviewTranscript: readonly string[] | undefined,
): string {
  const compactLine = reviewTranscript?.find((line) =>
    line.includes("[compact page scan]"),
  );
  expect(compactLine).toBeDefined();
  const jsonLine = (compactLine ?? "")
    .split("\n")
    .find((line) => line.startsWith("{"));
  expect(jsonLine).toBeDefined();
  return jsonLine!;
}

describe("runAgentDiscovery compact-first deterministic observation", () => {
  test("supported observation satisfying the target finishes with zero model and zero legacy extraction calls, checkpointing before kept-jobs progress", async () => {
    const journal: JournalEntry[] = [];
    const progressActions: Array<string | undefined> = [];
    const llmClient: LLMClient = { chatWithTools: vi.fn() };
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => []),
    };

    const config = createOrdinaryConfig({ targetJobCount: 2 });
    config.onCheckpoint = async (checkpoint) => {
      journal.push({ kind: "checkpoint", revision: checkpoint.revision });
    };

    const result = await runAgentDiscovery(
      createCompactFirstFakePage({
        snapshot: '- list:\n  - link "Frontend Engineer"',
        scanPayload: {
          elements: [
            {
              role: "link",
              accessibleName: "Frontend Engineer",
              href: "https://www.linkedin.com/jobs/view/438900001",
              containerKey: null,
              jobIdHint: "438900001",
            },
            {
              role: "link",
              accessibleName: "Backend Engineer",
              href: "https://www.linkedin.com/jobs/view/438900002",
              containerKey: null,
              jobIdHint: "438900002",
            },
          ],
        },
      }),
      config,
      llmClient,
      jobExtractor,
      (progress) => {
        progressActions.push(progress.currentAction);
        journal.push({
          kind: "progress",
          action: progress.currentAction,
          message: progress.message,
        });
      },
    );

    expect(result.jobs).toHaveLength(2);
    expect(result.jobs.map((job) => job.title)).toEqual([
      "Frontend Engineer",
      "Backend Engineer",
    ]);
    expect(
      result.jobs.every((job) => job.discoveryMethod === "browser_agent"),
    ).toBe(true);
    expect(result.incomplete).toBeFalsy();
    expect(result.error).toBeUndefined();
    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(0);
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(0);

    const keptProgressIndex = journal.findIndex(
      (entry) =>
        entry.kind === "progress" &&
        entry.action === "compact_page_observation",
    );
    const checkpointIndex = journal.findIndex(
      (entry) => entry.kind === "checkpoint",
    );
    expect(checkpointIndex).toBeGreaterThan(-1);
    expect(keptProgressIndex).toBeGreaterThan(checkpointIndex);
    expect(journal[keptProgressIndex]).toMatchObject({
      kind: "progress",
      message: expect.stringContaining("kept 2 new jobs"),
    });
    expect(
      progressActions.filter((action) => action === "compact_page_observation"),
    ).toHaveLength(1);
  });

  test("partial supported observation seeds state once, gives fallback bounded evidence only, and later extraction does not duplicate the retained composite", async () => {
    let llmCallCount = 0;
    const firstLlmMessages: AgentMessage[] = [];
    const llmClient: LLMClient = {
      chatWithTools: async (messages) => {
        llmCallCount += 1;
        if (llmCallCount === 1) {
          firstLlmMessages.push(...messages);
          return {
            content: "verify the recognized posting surface",
            toolCalls: [
              createToolCall(
                "extract_jobs",
                { pageType: "job_detail", maxJobs: 2 },
                "tool_extract_after_compact",
              ),
            ],
          };
        }
        return {
          content: "finishing after verification",
          toolCalls: [
            createToolCall(
              "finish",
              { reason: "Compact scan plus one verification pass is enough." },
              "tool_finish_after_compact",
            ),
          ],
        };
      },
    };
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => [
        {
          sourceJobId: "438900010",
          canonicalUrl: "https://www.linkedin.com/jobs/view/438900010",
          title: "Frontend Engineer",
          company: "Acme",
          location: "Remote",
          workMode: ["remote" as const],
          applyPath: "unknown" as const,
          postedAt: null,
          salaryText: null,
          summary: "Duplicate of the compact-retained composite.",
          description: "Duplicate of the compact-retained composite.",
          easyApplyEligible: false,
          keySkills: ["React"],
          responsibilities: [],
        },
      ]),
    };

    const config = createOrdinaryConfig({ targetJobCount: 2 });
    const result = await runAgentDiscovery(
      createCompactFirstFakePage({
        bodyText: `RawBodyMarker Search jobs Apply Job description Frontend Engineer Acme Remote. ${"Responsibilities include React and TypeScript. Qualifications include browser automation. ".repeat(12)}`,
        snapshot: '- list:\n  - link "SecretSnapshotMarker"',
        scanPayload: {
          elements: [
            {
              role: "link",
              accessibleName: "Frontend Engineer",
              href: "https://www.linkedin.com/jobs/view/438900010",
              containerKey: null,
              jobIdHint: "438900010",
            },
          ],
        },
      }),
      config,
      llmClient,
      jobExtractor,
    );

    expect(llmCallCount).toBe(2);
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(1);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.sourceJobId).toBe("438900010");
    expect(result.error).toBeUndefined();

    // Exactly one bounded fallback summary, without raw sample bodies.
    const compactLines = result.reviewTranscript?.filter((line) =>
      line.includes("[compact page scan]"),
    );
    expect(compactLines).toHaveLength(1);
    const compactLine = compactLines?.[0] ?? "";
    expect(compactLine).not.toContain("RawBodyMarker");
    expect(compactLine).not.toContain("SecretSnapshotMarker");
    expect(compactLine).toContain("snapshot-scoped proposals");

    const summary = JSON.parse(
      extractCompactSummaryJsonLine(result.reviewTranscript),
    ) as Record<string, unknown>;
    expect(summary.kind).toBe("supported");
    expect(summary.postingCandidateCount).toBe(1);
    expect(Object.keys(summary)).not.toContain("textSample");
    expect(Object.keys(summary)).not.toContain("accessibilitySummary");
    const retainedComposites = summary.retainedComposites as Array<{
      compositeKey: string;
      title: string;
      canonicalUrl: string;
    }>;
    expect(retainedComposites).toHaveLength(1);
    expect(retainedComposites[0]?.compositeKey).toBe(
      "https://www.linkedin.com/jobs/view/438900010::438900010",
    );

    // The fallback model conversation actually receives the bounded evidence.
    expect(
      firstLlmMessages.some(
        (message) =>
          message.role === "user" &&
          message.content.includes("[compact page scan]"),
      ),
    ).toBe(true);
  });

  test("keeps checkpointed compact jobs as a truthful partial result when model expansion is unavailable", async () => {
    const llmClient: LLMClient = {
      chatWithTools: vi.fn(async () => {
        throw new Error("AI client does not support tool calling");
      }),
    };
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => []),
    };

    const result = await runAgentDiscovery(
      createCompactFirstFakePage({
        scanPayload: {
          elements: [
            {
              role: "link",
              accessibleName: "Frontend Engineer",
              href: "https://www.linkedin.com/jobs/view/438900011",
              containerKey: null,
              jobIdHint: "438900011",
            },
          ],
        },
      }),
      createOrdinaryConfig({ targetJobCount: 50 }),
      llmClient,
      jobExtractor,
    );

    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(1);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.sourceJobId).toBe("438900011");
    expect(result.incomplete).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.warning).toBe(
      "Deterministic page discovery kept partial results, but model-assisted expansion was unavailable.",
    );
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(0);
  });

  test("keeps model expansion failure fatal when compact discovery retained no jobs", async () => {
    const llmClient: LLMClient = {
      chatWithTools: vi.fn(async () => {
        throw new Error("AI client does not support tool calling");
      }),
    };

    const result = await runAgentDiscovery(
      createCompactFirstFakePage({ scanPayload: { elements: [] } }),
      createOrdinaryConfig({ targetJobCount: 50 }),
      llmClient,
      { extractJobsFromPage: vi.fn(async () => []) },
    );

    expect(llmClient.chatWithTools).toHaveBeenCalledTimes(1);
    expect(result.jobs).toHaveLength(0);
    expect(result.warning).toBeUndefined();
    expect(result.error).toContain("LLM call failed after 3 attempts");
  });

  test("unsupported observation falls back instead of failing and its summary stays bounded and sanitized", async () => {
    let llmCallCount = 0;
    const llmClient: LLMClient = {
      chatWithTools: async () => {
        llmCallCount += 1;
        return {
          content: "handing control back after the wall was detected",
          toolCalls: [
            createToolCall(
              "finish",
              { reason: "Auth wall detected deterministically." },
              "tool_finish_unsupported_compact",
            ),
          ],
        };
      },
    };
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => []),
    };

    const result = await runAgentDiscovery(
      createCompactFirstFakePage({
        bodyText:
          "Please sign in to continue viewing job recommendations on this board.",
      }),
      createOrdinaryConfig(),
      llmClient,
      jobExtractor,
    );

    expect(llmCallCount).toBe(1);
    expect(result.error).toBeUndefined();
    expect(result.jobs).toHaveLength(0);

    const compactLine =
      result.reviewTranscript?.find((line) =>
        line.includes("[compact page scan]"),
      ) ?? "";
    expect(compactLine).toBeDefined();
    expect(compactLine).not.toContain("Blocked by");
    expect(compactLine).not.toContain("sign in to continue");

    const summary = JSON.parse(
      extractCompactSummaryJsonLine(result.reviewTranscript),
    ) as Record<string, unknown>;
    expect(summary.kind).toBe("unsupported");
    expect(summary.reason).toBe("auth_required");
    expect(summary.pageUrl).toBe("https://www.linkedin.com/jobs/search/");
    expect(Object.keys(summary)).not.toContain("detail");
    expect(Object.keys(summary)).not.toContain("retainedComposites");
  });

  test("resumed checkpoint composites are not recounted or duplicated by the compact merge", async () => {
    const checkpointHolder: { current: BrowserAgentRunCheckpoint | null } = {
      current: null,
    };

    const firstRunConfig = createOrdinaryConfig({ targetJobCount: 1 });
    firstRunConfig.onCheckpoint = async (checkpoint) => {
      checkpointHolder.current = checkpoint;
    };
    await runAgentDiscovery(
      createCompactFirstFakePage({
        scanPayload: {
          elements: [
            {
              role: "link",
              accessibleName: "Frontend Engineer",
              href: "https://www.linkedin.com/jobs/view/438900010",
              containerKey: null,
              jobIdHint: "438900010",
            },
          ],
        },
      }),
      firstRunConfig,
      { chatWithTools: vi.fn() },
      { extractJobsFromPage: vi.fn(async () => []) },
    );
    expect(checkpointHolder.current).not.toBeNull();

    let secondRunLlmCalls = 0;
    const resumedConfig = createOrdinaryConfig({ targetJobCount: 1 });
    resumedConfig.resumeCheckpoint = checkpointHolder.current!;
    const resumedResult = await runAgentDiscovery(
      createCompactFirstFakePage({
        scanPayload: {
          elements: [
            {
              role: "link",
              accessibleName: "Frontend Engineer",
              href: "https://www.linkedin.com/jobs/view/438900010",
              containerKey: null,
              jobIdHint: "438900010",
            },
          ],
        },
      }),
      resumedConfig,
      {
        chatWithTools: async () => {
          secondRunLlmCalls += 1;
          return {
            content: "finishing after confirming the resumed inventory",
            toolCalls: [
              createToolCall(
                "finish",
                { reason: "Resumed composite already satisfies the target." },
                "tool_finish_resume_compact",
              ),
            ],
          };
        },
      },
      { extractJobsFromPage: vi.fn(async () => []) },
    );

    expect(resumedResult.jobs).toHaveLength(1);
    expect(resumedResult.jobs[0]?.sourceJobId).toBe("438900010");
    // The duplicate added nothing, so the run did not falsely reach this-run
    // target and fell through to the model path exactly once.
    expect(secondRunLlmCalls).toBe(1);
    expect(
      resumedResult.reviewTranscript?.filter((line) =>
        line.includes("[compact page scan]"),
      ) ?? [],
    ).toHaveLength(1);
  });

  test("source-debug phases never invoke the compact scanner and keep existing closeout semantics", async () => {
    let evaluateCallCount = 0;
    const compactProgressActions: Array<string | undefined> = [];
    let llmCallCount = 0;

    const result = await runAgentDiscovery(
      createCompactFirstFakePage({
        onEvaluate: () => {
          evaluateCallCount += 1;
          throw new Error("compact scanner must not run for source-debug");
        },
      }),
      createConfig(), // Default fixture carries promptContext.taskPacket.
      {
        chatWithTools: async () => {
          llmCallCount += 1;
          return {
            content: "phase goal proven",
            toolCalls: [
              createToolCall(
                "finish",
                {
                  reason: "Evidence budget satisfied.",
                  summary: "Routes verified without the deterministic tier.",
                  reliableControls: [],
                  trickyFilters: [],
                  navigationTips: [],
                  applyTips: [],
                  warnings: [],
                },
                "tool_finish_source_debug_compact_skip",
              ),
            ],
          };
        },
      },
      { extractJobsFromPage: vi.fn(async () => []) },
      (progress) => {
        compactProgressActions.push(progress.currentAction);
      },
    );

    expect(evaluateCallCount).toBe(0);
    expect(llmCallCount).toBe(1);
    expect(result.phaseCompletionMode).toBe("structured_finish");
    expect(result.debugFindings?.summary).toBe(
      "Routes verified without the deterministic tier.",
    );
    expect(
      compactProgressActions.filter(
        (action) => action === "compact_page_observation",
      ),
    ).toHaveLength(0);
  });

  test("abort before the compact observation prevents any scanner, model, or fallback work", async () => {
    const controller = new AbortController();
    controller.abort();
    let evaluateCallCount = 0;
    const progressActions: Array<string | undefined> = [];

    const result = await runAgentDiscovery(
      createCompactFirstFakePage({
        onEvaluate: () => {
          evaluateCallCount += 1;
        },
      }),
      createOrdinaryConfig(),
      { chatWithTools: vi.fn() },
      { extractJobsFromPage: vi.fn(async () => []) },
      (progress) => {
        progressActions.push(progress.currentAction);
      },
      controller.signal,
    );

    expect(evaluateCallCount).toBe(0);
    expect(result.incomplete).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.jobs).toHaveLength(0);
    expect(progressActions).not.toContain("compact_page_observation");
  });

  test("abort after the compact observation returns truthfully before any merge, checkpoint, or fallback work", async () => {
    const controller = new AbortController();
    let llmCallCount = 0;
    const progressActions: Array<string | undefined> = [];

    const result = await runAgentDiscovery(
      createCompactFirstFakePage({
        onEvaluate: () => {
          controller.abort();
        },
        scanPayload: {
          elements: [
            {
              role: "link",
              accessibleName: "Frontend Engineer",
              href: "https://www.linkedin.com/jobs/view/438900010",
              containerKey: null,
              jobIdHint: "438900010",
            },
          ],
        },
      }),
      createOrdinaryConfig(),
      {
        chatWithTools: async () => {
          llmCallCount += 1;
          return { content: "should never be asked" };
        },
      },
      { extractJobsFromPage: vi.fn(async () => []) },
      (progress) => {
        progressActions.push(progress.currentAction);
      },
      controller.signal,
    );

    expect(controller.signal.aborted).toBe(true);
    expect(llmCallCount).toBe(0);
    expect(result.incomplete).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.jobs).toHaveLength(0);
    expect(progressActions).not.toContain("compact_page_observation");
  });

  test("multi-job board scan payload binds employers before checkpointing", async () => {
    const journal: JournalEntry[] = [];
    const llmClient: LLMClient = { chatWithTools: vi.fn() };
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => []),
    };

    const config = createOrdinaryConfig({ targetJobCount: 2 });
    config.startingUrls = [
      "https://wellfound.com/role/l/data-engineer/san-francisco",
    ];
    config.navigationPolicy = {
      allowedHostnames: ["wellfound.com", "www.wellfound.com"],
    };
    config.promptContext = { siteLabel: "Wellfound" };
    config.onCheckpoint = async (checkpoint) => {
      journal.push({ kind: "checkpoint", revision: checkpoint.revision });
    };

    const result = await runAgentDiscovery(
      createCompactFirstFakePage({
        url: "https://wellfound.com/role/l/data-engineer/san-francisco",
        scanPayload: {
          elements: [
            {
              role: "link",
              accessibleName: "Data Engineer",
              href: "https://wellfound.com/jobs/4505800-data-engineer",
              containerKey: null,
              jobIdHint: null,
              companyHref: "https://wellfound.com/company/sigma-computing-2",
              companyLabel: "Sigma Computing",
            },
            {
              role: "link",
              accessibleName: "Customer Deployment Engineer",
              href: "https://wellfound.com/jobs/4475735-customer-deployment-engineer",
              containerKey: null,
              jobIdHint: null,
              companyHref: "https://wellfound.com/company/sigma-computing-2",
              companyLabel: "Sigma Computing",
            },
          ],
        },
      }),
      config,
      llmClient,
      jobExtractor,
      (progress) => {
        journal.push({
          kind: "progress",
          action: progress.currentAction,
          message: progress.message,
        });
      },
    );

    expect(result.jobs).toHaveLength(2);
    expect(result.jobs.every((job) => job.company === "Sigma Computing")).toBe(
      true,
    );
    expect(
      result.jobs.every((job) => job.company !== "Employer not stated"),
    ).toBe(true);
    expect(llmClient.chatWithTools).not.toHaveBeenCalled();
    expect(jobExtractor.extractJobsFromPage).not.toHaveBeenCalled();
    expect(journal.some((entry) => entry.kind === "checkpoint")).toBe(true);
  });
});
