import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExposeInMainWorld, mockInvoke } = vi.hoisted(() => ({
  mockExposeInMainWorld: vi.fn(),
  mockInvoke: vi.fn(),
}));

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: mockExposeInMainWorld,
  },
  ipcRenderer: {
    invoke: mockInvoke,
    off: vi.fn(),
    on: vi.fn(),
    send: vi.fn(),
  },
}));

import "./index";

type ExposedJobFinderApi = {
  markAllCampaignNotificationsRead: () => Promise<unknown>;
  mutateSafeguards: (input: unknown) => Promise<unknown>;
  mutateCompanyIntelligence: (input: unknown) => Promise<unknown>;
  projectGroupedManualAnswer: (command: unknown) => Promise<unknown>;
  applyGroupedManualAnswer: (input: unknown) => Promise<unknown>;
  snoozeGroupedDecision: (input: unknown) => Promise<unknown>;
  recordOutcome: (input: unknown) => Promise<unknown>;
  setOutcomeSuggestionEnabled: (input: unknown) => Promise<unknown>;
  recommendResumeStrategy: (input: unknown) => Promise<unknown>;
  setCampaignResumeStrategyDefault: (input: unknown) => Promise<unknown>;
  saveResumeStrategy: (input: unknown) => Promise<unknown>;
  selectResumeStrategy: (input: unknown) => Promise<unknown>;
  disableResumeStrategy: (strategyId: string) => Promise<unknown>;
};

const exposedJobFinder = (() => {
  const exposed = mockExposeInMainWorld.mock.calls.at(-1)?.[1] as
    | { jobFinder: ExposedJobFinderApi }
    | undefined;
  if (!exposed) {
    throw new Error("Preload did not expose the unemployed API.");
  }
  return exposed.jobFinder;
})();

describe("preload jobFinder grouped manual-answer boundary", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
  });

  it("exposes projectGroupedManualAnswer over the typed channel", async () => {
    const snapshot = { generatedAt: "2026-08-15T10:00:00.000Z" };
    mockInvoke.mockResolvedValueOnce(snapshot);
    const command = {
      groupKey: "group_1",
      requestId: "request_a",
      expectedRequestRevision: 1,
      answer: { type: "text", value: "5 years" },
      saveScope: "reusable_profile",
    };

    const result = await exposedJobFinder.projectGroupedManualAnswer(command);

    expect(mockInvoke).toHaveBeenCalledWith(
      "job-finder:project-grouped-manual-answer",
      command,
    );
    expect(result).toEqual(snapshot);
  });

  it("exposes applyGroupedManualAnswer over the typed channel", async () => {
    const snapshot = { generatedAt: "2026-08-15T10:01:00.000Z" };
    mockInvoke.mockResolvedValueOnce(snapshot);
    const input = {
      decisionId: "group_1:abc123",
      requestIds: ["request_a", "request_b"],
      expectedRequestRevisions: { request_a: 1, request_b: 1 },
      answer: { type: "text", value: "5 years" },
    };

    const result = await exposedJobFinder.applyGroupedManualAnswer(input);

    expect(mockInvoke).toHaveBeenCalledWith(
      "job-finder:apply-grouped-manual-answer",
      input,
    );
    expect(result).toEqual(snapshot);
  });

  it("exposes snoozeGroupedDecision over the typed channel", async () => {
    const snapshot = { generatedAt: "2026-08-15T10:02:00.000Z" };
    mockInvoke.mockResolvedValueOnce(snapshot);
    const input = {
      decisionId: "group_1:abc123",
      expectedRevision: 1,
      until: "2026-08-17T10:00:00.000Z",
      reason: "Ask the recruiter",
    };

    const result = await exposedJobFinder.snoozeGroupedDecision(input);

    expect(mockInvoke).toHaveBeenCalledWith(
      "job-finder:snooze-grouped-decision",
      input,
    );
    expect(result).toEqual(snapshot);
  });

  it("exposes markAllCampaignNotificationsRead over the typed channel", async () => {
    const snapshot = { generatedAt: "2026-08-15T10:03:00.000Z" };
    mockInvoke.mockResolvedValueOnce(snapshot);

    const result = await exposedJobFinder.markAllCampaignNotificationsRead();

    expect(mockInvoke).toHaveBeenCalledWith(
      "job-finder:mark-all-campaign-notifications-read",
    );
    expect(result).toEqual(snapshot);
  });

  it("exposes recordOutcome over the typed channel", async () => {
    const snapshot = { generatedAt: "2026-08-15T10:04:00.000Z" };
    mockInvoke.mockResolvedValueOnce(snapshot);
    const input = {
      jobId: "job-1",
      outcome: "interview",
      resumeStrategyId: "strategy-1",
      note: "Recruiter call went well",
    };

    const result = await exposedJobFinder.recordOutcome(input);

    expect(mockInvoke).toHaveBeenCalledWith(
      "job-finder:record-outcome",
      input,
    );
    expect(result).toEqual(snapshot);
  });

  it("exposes mutateSafeguards over the typed channel", async () => {
    const snapshot = { generatedAt: "2026-08-15T10:06:00.000Z" };
    mockInvoke.mockResolvedValueOnce(snapshot);
    const input = {
      type: "record_listing_signal",
      signalId: "signal_1",
      jobId: "job-1",
      signal: "closed",
      detail: null,
      detectedAt: "2026-08-15T10:00:00.000Z",
      confidence: 0.9,
      provenance: "provider",
      explanation: "Provider reported the listing as closed.",
      recoveryGuidance: "Re-verify the listing before applying.",
    };

    const result = await exposedJobFinder.mutateSafeguards(input);

    expect(mockInvoke).toHaveBeenCalledWith(
      "job-finder:mutate-safeguards",
      input,
    );
    expect(result).toEqual(snapshot);
  });

  it("exposes setOutcomeSuggestionEnabled over the typed channel", async () => {
    const snapshot = { generatedAt: "2026-08-15T10:05:00.000Z" };
    mockInvoke.mockResolvedValueOnce(snapshot);
    const disable = { dimension: "source", key: "example", enabled: false };

    const result = await exposedJobFinder.setOutcomeSuggestionEnabled(disable);

    expect(mockInvoke).toHaveBeenCalledWith(
      "job-finder:set-outcome-suggestion-enabled",
      disable,
    );
    expect(result).toEqual(snapshot);

    const reset = {
      dimension: "campaign",
      key: "campaign-1",
      enabled: true,
      reset: true,
    };
    mockInvoke.mockResolvedValueOnce(snapshot);
    const resetResult = await exposedJobFinder.setOutcomeSuggestionEnabled(
      reset,
    );

    expect(mockInvoke).toHaveBeenLastCalledWith(
      "job-finder:set-outcome-suggestion-enabled",
      reset,
    );
    expect(resetResult).toEqual(snapshot);
  });

  it("exposes recommendResumeStrategy over the typed channel", async () => {
    const recommendation = {
      jobId: "job-1",
      campaignId: "campaign-1",
      roleFamily: "Backend Engineering",
      strategyId: "strategy-1",
      strategyName: "Backend",
      source: "role_family",
      reason: "Exact role family match.",
    };
    mockInvoke.mockResolvedValueOnce(recommendation);

    const result = await exposedJobFinder.recommendResumeStrategy({
      jobId: "job-1",
      campaignId: "campaign-1",
    });

    expect(mockInvoke).toHaveBeenCalledWith(
      "job-finder:recommend-resume-strategy",
      { jobId: "job-1", campaignId: "campaign-1" },
    );
    expect(result).toEqual(recommendation);
  });

  it("exposes setCampaignResumeStrategyDefault over the typed channel", async () => {
    const snapshot = { generatedAt: "2026-08-15T10:06:00.000Z" };
    mockInvoke.mockResolvedValueOnce(snapshot);

    const result = await exposedJobFinder.setCampaignResumeStrategyDefault({
      campaignId: "campaign-1",
      strategyId: "strategy-1",
    });

    expect(mockInvoke).toHaveBeenCalledWith(
      "job-finder:set-campaign-resume-strategy-default",
      { campaignId: "campaign-1", strategyId: "strategy-1" },
    );
    expect(result).toEqual(snapshot);
  });

  it("exposes saveResumeStrategy and disableResumeStrategy over typed channels", async () => {
    const snapshot = { generatedAt: "2026-08-15T10:07:00.000Z" };
    mockInvoke.mockResolvedValueOnce(snapshot);
    const input = {
      id: null,
      name: "Backend",
      roleFamily: "Backend Engineering",
      baseResumeDocumentId: "document-1",
      templateId: "classic_ats",
      headlinePolicy: "fixed",
      skillsPolicy: "base_only",
      coveragePolicy: "base_omissions",
      tailoringStrength: "conservative",
      evidenceBoundaries: {},
      enabled: true,
    };

    const saveResult = await exposedJobFinder.saveResumeStrategy(input);
    expect(mockInvoke).toHaveBeenCalledWith(
      "job-finder:save-resume-strategy",
      input,
    );
    expect(saveResult).toEqual(snapshot);

    mockInvoke.mockResolvedValueOnce(snapshot);
    const disableResult = await exposedJobFinder.disableResumeStrategy(
      "strategy-1",
    );
    expect(mockInvoke).toHaveBeenLastCalledWith(
      "job-finder:disable-resume-strategy",
      "strategy-1",
    );
    expect(disableResult).toEqual(snapshot);
  });

  it("exposes mutateCompanyIntelligence over the typed channel", async () => {
    const snapshot = { generatedAt: "2026-08-15T10:09:00.000Z" };
    mockInvoke.mockResolvedValueOnce(snapshot);
    const input = {
      companyId: "company_1",
      expectedUpdatedAt: "2026-08-15T10:00:00.000Z",
      mutation: {
        type: "add_note",
        note: {
          id: "note_1",
          body: "Recruiter call scheduled.",
          createdAt: "2026-08-15T10:09:00.000Z",
          updatedAt: "2026-08-15T10:09:00.000Z",
        },
      },
    };

    const result = await exposedJobFinder.mutateCompanyIntelligence(input);

    expect(mockInvoke).toHaveBeenCalledWith(
      "job-finder:mutate-company-intelligence",
      input,
    );
    expect(result).toEqual(snapshot);
  });
});
