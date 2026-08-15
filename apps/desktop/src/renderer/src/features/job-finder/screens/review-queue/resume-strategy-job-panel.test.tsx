// @vitest-environment jsdom

import type {
  ResumeStrategy,
  ResumeStrategyRecommendation,
  ResumeStrategySelection,
  SelectResumeStrategyInput,
} from "@unemployed/contracts";
import { ResumeStrategySchema } from "@unemployed/contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResumeStrategyJobPanel } from "./resume-strategy-job-panel";

afterEach(() => {
  cleanup();
});

function strategy(overrides: Partial<ResumeStrategy> = {}): ResumeStrategy {
  return ResumeStrategySchema.parse({
    id: "strategy_1",
    name: "Backend engineering",
    roleFamily: "Backend Engineering",
    baseResumeDocumentId: "resume_1",
    templateId: "classic_ats",
    headlinePolicy: "fixed",
    skillsPolicy: "base_only",
    coveragePolicy: "base_omissions",
    tailoringStrength: "conservative",
    evidenceBoundaries: {},
    enabled: true,
    createdAt: "2026-08-15T09:00:00.000Z",
    updatedAt: "2026-08-15T09:00:00.000Z",
    ...overrides,
  });
}

function recommendation(
  overrides: Partial<ResumeStrategyRecommendation> = {},
): ResumeStrategyRecommendation {
  return {
    jobId: "job_1",
    campaignId: "campaign_1",
    roleFamily: "Backend Engineering",
    strategyId: "strategy_1",
    strategyName: "Backend engineering",
    source: "role_family",
    reason: 'Exact enabled role family match: "Backend Engineering".',
    ...overrides,
  };
}

describe("ResumeStrategyJobPanel", () => {
  it("shows the inspectable recommendation reason and lets the user select it", async () => {
    const onRecommend = vi
      .fn<
        (input: {
          jobId: string;
        }) => Promise<ResumeStrategyRecommendation | null>
      >()
      .mockResolvedValue(recommendation());
    const onSelect = vi.fn<(input: SelectResumeStrategyInput) => void>();

    render(
      <ResumeStrategyJobPanel
        campaignId="campaign_1"
        isPending={false}
        jobId="job_1"
        onRecommend={onRecommend}
        onSelect={onSelect}
        selections={[]}
        strategies={[strategy()]}
      />,
    );

    expect(screen.getByText(/Checking strategies for this job/)).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText(/Recommended: Backend engineering/)).toBeTruthy();
    });
    expect(screen.getByText(/Exact enabled role family match/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Choose a strategy for this job"), {
      target: { value: "strategy_1" },
    });
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job_1",
        campaignId: "campaign_1",
        strategyId: "strategy_1",
        source: "manual",
      }),
    );
    const selection = onSelect.mock.calls[0]?.[0];
    expect(selection?.reason).toContain(
      "User accepted the recommended strategy",
    );
    expect(selection?.reason).toContain("Exact enabled role family match");
  });

  it("records a manual choice with a distinct inspectable reason", async () => {
    const onRecommend = vi
      .fn<
        (input: {
          jobId: string;
        }) => Promise<ResumeStrategyRecommendation | null>
      >()
      .mockResolvedValue(recommendation());
    const onSelect = vi.fn<(input: SelectResumeStrategyInput) => void>();

    render(
      <ResumeStrategyJobPanel
        campaignId="campaign_1"
        isPending={false}
        jobId="job_1"
        onRecommend={onRecommend}
        onSelect={onSelect}
        selections={[]}
        strategies={[
          strategy(),
          strategy({
            id: "strategy_2",
            name: "Frontend engineering",
            roleFamily: "Frontend Engineering",
          }),
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Recommended: Backend engineering/)).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText("Choose a strategy for this job"), {
      target: { value: "strategy_2" },
    });
    const selection = onSelect.mock.calls[0]?.[0];
    expect(selection?.strategyId).toBe("strategy_2");
    expect(selection?.reason).toContain(
      'User chose strategy "Frontend engineering"',
    );
    expect(selection?.reason).toContain("instead of the recommendation");
  });

  it("shows the persisted selection with its own reason", async () => {
    const onRecommend = vi
      .fn<
        (input: {
          jobId: string;
        }) => Promise<ResumeStrategyRecommendation | null>
      >()
      .mockResolvedValue(recommendation());
    const selection: ResumeStrategySelection = {
      id: "selection_1",
      campaignId: "campaign_1",
      jobId: "job_1",
      strategyId: "strategy_1",
      source: "user",
      reason: "User picked the backend strategy for this posting.",
      selectedAt: "2026-08-15T10:00:00.000Z",
    };

    render(
      <ResumeStrategyJobPanel
        campaignId="campaign_1"
        isPending={false}
        jobId="job_1"
        onRecommend={onRecommend}
        onSelect={vi.fn()}
        selections={[selection]}
        strategies={[strategy()]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Your choice: Backend engineering/)).toBeTruthy();
    });
    expect(
      screen.getByText("User picked the backend strategy for this posting."),
    ).toBeTruthy();
  });

  it("shows an honest no-match state and never offers a disabled strategy", async () => {
    const onRecommend = vi
      .fn<
        (input: {
          jobId: string;
        }) => Promise<ResumeStrategyRecommendation | null>
      >()
      .mockResolvedValue(
        recommendation({
          strategyId: null,
          strategyName: null,
          source: "none",
          roleFamily: null,
          reason:
            'No enabled strategy matches roleFamily "Data Engineering" and no usable campaign default is available.',
        }),
      );

    render(
      <ResumeStrategyJobPanel
        campaignId="campaign_1"
        isPending={false}
        jobId="job_1"
        onRecommend={onRecommend}
        onSelect={vi.fn()}
        selections={[]}
        strategies={[
          strategy({ enabled: false }),
          strategy({
            id: "strategy_3",
            name: "Data engineering",
            roleFamily: "Data Engineering",
          }),
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("No strategy recommended")).toBeTruthy();
    });
    expect(
      screen.getByText(/No enabled strategy matches roleFamily/),
    ).toBeTruthy();

    const select = screen.getByLabelText("Choose a strategy for this job");
    const options = Array.from(select.querySelectorAll("option")).map(
      (option) => option.textContent,
    );
    expect(options).toContain("Data engineering");
    expect(options).not.toContain("Backend engineering");
  });

  it("shows a loading state while recommending and an error state on failure", async () => {
    const onRecommend = vi
      .fn<
        (input: {
          jobId: string;
        }) => Promise<ResumeStrategyRecommendation | null>
      >()
      .mockRejectedValue(new Error("The campaign is unavailable."));

    render(
      <ResumeStrategyJobPanel
        campaignId="campaign_1"
        isPending={false}
        jobId="job_1"
        onRecommend={onRecommend}
        onSelect={vi.fn()}
        selections={[]}
        strategies={[]}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Strategy recommendation unavailable"),
      ).toBeTruthy();
    });
    expect(screen.getByText("The campaign is unavailable.")).toBeTruthy();
  });
});
