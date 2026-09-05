import { describe, expect, test, vi } from "vitest";
import type { Page } from "playwright";
import type { BrowserAgentRunCheckpoint } from "@unemployed/contracts";
import { runAgentDiscovery, type JobExtractor, type LLMClient } from "./agent";
import { createConfig, createToolCall } from "./agent.test-fixtures";

function createResultsPage(): Page {
  return {
    async goto() {
      return null as never;
    },
    async waitForTimeout() {
      return undefined;
    },
    url() {
      return "https://www.linkedin.com/jobs/search/";
    },
    async title() {
      return "Primary target";
    },
    locator(selector: string) {
      if (selector === "body") {
        return {
          async innerText() {
            return [
              "Search by title, skill, or company",
              "Frontend Engineer",
              "Acme",
              "Remote",
              "Apply",
              "Job description",
              "Build product interfaces for customer workflows.",
              "Use the jobs search filters and recommendations to find relevant roles quickly.",
            ]
              .join("\n")
              .repeat(20);
          },
        } as never;
      }

      return {
        async innerText() {
          return "";
        },
      } as never;
    },
    async evaluate(fn: unknown) {
      const serialized = String(fn);

      if (
        serialized.includes("cardCandidates") ||
        serialized.includes("application/ld+json")
      ) {
        return {
          structuredDataCandidates: [],
          cardCandidates: [
            {
              canonicalUrl: "https://www.linkedin.com/jobs/view/job_batch_1",
              anchorText: "Frontend Engineer",
              headingText: "Frontend Engineer",
              lines: [
                "Frontend Engineer",
                "Acme",
                "Remote",
                "Build product interfaces for customer workflows.",
                "Easy Apply",
              ],
            },
          ],
        };
      }

      if (serialized.includes('querySelectorAll("a[href]")')) {
        return ["https://www.linkedin.com/jobs/view/job_batch_1"];
      }

      return [];
    },
  } as unknown as Page;
}

describe("runAgentDiscovery checkpoint cadence", () => {
  test("automatic batch collection saves a checkpoint as soon as a pass keeps jobs", async () => {
    const page = createResultsPage();
    const llmClient: LLMClient = {
      chatWithTools: vi.fn().mockResolvedValueOnce({
        content: "Finished collecting",
        toolCalls: [
          createToolCall("finish", { reason: "Enough jobs" }, "tool_finish"),
        ],
      }),
    };
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => []),
    };
    const checkpoints: BrowserAgentRunCheckpoint[] = [];

    const result = await runAgentDiscovery(
      page,
      {
        ...createConfig(),
        targetJobCount: 20,
        promptContext: {
          siteLabel: "Primary target",
        },
        onCheckpoint: (checkpoint) => {
          checkpoints.push(checkpoint);
        },
      },
      llmClient,
      jobExtractor,
    );

    expect(result.jobs).toHaveLength(1);
    expect(
      checkpoints.some((checkpoint) => checkpoint.collectedJobs.length === 1),
    ).toBe(true);
    // Checkpoint revisions stay ordered and every payload keeps the full
    // collected snapshot so downstream incremental persistence can diff it.
    const revisions = checkpoints.map((checkpoint) => checkpoint.revision);
    expect([...revisions].sort((left, right) => left - right)).toEqual(
      revisions,
    );
    expect(
      checkpoints.every((checkpoint) =>
        Array.isArray(checkpoint.collectedJobs),
      ),
    ).toBe(true);
  });

  test("a single captured results page is extracted at the next planning gap instead of waiting for a full batch", async () => {
    const page = createResultsPage();
    const llmClient: LLMClient = {
      chatWithTools: vi
        .fn()
        .mockResolvedValueOnce({
          content: "capture the results page",
          toolCalls: [
            createToolCall(
              "extract_jobs",
              { pageType: "search_results", maxJobs: 2 },
              "tool_extract_1",
            ),
          ],
        })
        .mockResolvedValueOnce({
          content: "No action taken",
          toolCalls: [],
        }),
    };
    const jobExtractor: JobExtractor = {
      extractJobsFromPage: vi.fn(async () => {
        return [
          {
            sourceJobId: "job_deferred_1",
            canonicalUrl: "https://www.linkedin.com/jobs/view/job_deferred_1",
            title: "Workflow Engineer",
            company: "Signal Systems",
            location: "Remote",
            workMode: ["remote" as const],
            applyPath: "unknown" as const,
            postedAt: "2026-03-20T09:00:00.000Z",
            salaryText: null,
            summary: "Deferred extraction sample.",
            description: "Deferred extraction sample.",
            easyApplyEligible: false,
            keySkills: ["React"],
            responsibilities: [],
          },
        ];
      }),
    };
    const checkpointJobCounts: number[] = [];

    const checkpointPayloads: BrowserAgentRunCheckpoint[] = [];
    const result = await runAgentDiscovery(
      page,
      {
        ...createConfig(),
        targetJobCount: 2,
        maxSteps: 6,
        promptContext: {
          siteLabel: "Primary target",
        },
        onCheckpoint: (checkpoint) => {
          checkpointJobCounts.push(checkpoint.collectedJobs.length);
          checkpointPayloads.push(checkpoint);
        },
      },
      llmClient,
      jobExtractor,
    );

    // The lone deferred page was reviewed exactly once, right after the
    // capture turn, completing the two-job target without extra planning
    // turns or repeated provider extraction calls. The kept deferred job is
    // checkpointed in the same step as its extraction.
    expect(jobExtractor.extractJobsFromPage).toHaveBeenCalledTimes(1);
    expect(result.jobs).toHaveLength(2);
    expect(checkpointJobCounts).toEqual([1, 2]);

    // Each stored revision snapshot remains independent of the agent's later
    // mutable collected array: revision 1 keeps exactly the one job it
    // captured even though the agent's own list grew to two afterwards.
    const firstCapturedArray = checkpointPayloads[0]!.collectedJobs;
    expect(firstCapturedArray).toHaveLength(1);
    expect(firstCapturedArray).not.toBe(result.jobs);
  });
});
