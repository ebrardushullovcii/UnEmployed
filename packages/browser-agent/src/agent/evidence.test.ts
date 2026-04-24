import { describe, expect, test, vi } from "vitest";
import {
  addExtractedJobsToState,
  recordToolEvidence,
  scoreCollectedJobQuality,
  type ExtractedJobInput,
} from "./evidence";
import type { AgentState } from "../types";

function createState(): AgentState {
  return {
    conversation: [],
    reviewTranscript: [],
    collectedJobs: [],
    deferredSearchExtractions: new Map(),
    visitedUrls: new Set(),
    stepCount: 0,
    currentUrl: "https://jobs.example.com/search?debug=1",
    lastStableUrl: "https://jobs.example.com/search",
    isRunning: true,
    phaseEvidence: {
      visibleControls: [],
      successfulInteractions: [],
      routeSignals: [],
      attemptedControls: [],
      warnings: [],
    },
    compactionState: null,
    compactionStatus: {
      lastTriggerKind: null,
      usedMessageCountFallback: false,
      lastEstimatedTokensBefore: null,
      lastEstimatedTokensAfter: null,
    },
  };
}

function createJob(
  overrides: Partial<ExtractedJobInput> = {},
): ExtractedJobInput {
  return {
    sourceJobId: "job_quality",
    canonicalUrl: "https://jobs.example.com/job-quality",
    title: "Staff Frontend Engineer",
    company: "Signal Systems",
    location: "Remote",
    description: "Build product experiences.",
    salaryText: null,
    summary: "Build product experiences.",
    postedAt: null,
    workMode: ["remote"],
    applyPath: "unknown",
    easyApplyEligible: false,
    keySkills: [],
    ...overrides,
  };
}

describe("recordToolEvidence", () => {
  test("sanitizes user-facing warnings and logs raw tool errors", () => {
    const state = createState();
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      recordToolEvidence(
        "fill",
        { role: "searchbox", name: "Keywords" },
        {
          success: false,
          error:
            "Timeout 10000ms exceeded while querying internal selector stack",
        },
        state,
      );

      expect(state.phaseEvidence.warnings).toEqual(["fill timed out."]);
      expect(errorSpy).toHaveBeenCalledWith(
        "[Agent] Tool failed during evidence recording:",
        expect.objectContaining({
          error:
            "Timeout 10000ms exceeded while querying internal selector stack",
          toolName: "fill",
        }),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("addExtractedJobsToState", () => {
  test("keeps distinct LinkedIn seeded-search cards that share a search-route canonical url", () => {
    const state = createState();

    const addedCount = addExtractedJobsToState(
      [
        {
          sourceJobId: "linkedin_seeded_card_frontend",
          canonicalUrl:
            "https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo",
          title: "Frontend Engineer",
          company: "Odiin",
          location: "Prishtina, Kosovo",
          description: "Frontend role.",
          salaryText: null,
          summary: "Frontend role.",
          postedAt: null,
          workMode: ["remote"],
          applyPath: "unknown",
          easyApplyEligible: false,
          keySkills: [],
        },
        {
          sourceJobId: "linkedin_seeded_card_fullcircle",
          canonicalUrl:
            "https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo",
          title: "Full Stack Developer (AI-First)",
          company: "Full Circle Agency",
          location: "Prishtina (Remote)",
          description: "Full-stack role.",
          salaryText: null,
          summary: "Full-stack role.",
          postedAt: null,
          workMode: ["remote"],
          applyPath: "unknown",
          easyApplyEligible: false,
          keySkills: [],
        },
      ],
      state,
      "target_site",
    );

    expect(addedCount).toBe(2);
    expect(state.collectedJobs).toHaveLength(2);
    expect(state.collectedJobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceJobId: "linkedin_seeded_card_frontend",
        }),
        expect.objectContaining({
          sourceJobId: "linkedin_seeded_card_fullcircle",
        }),
      ]),
    );
  });

  test("still deduplicates stable LinkedIn detail urls", () => {
    const state = createState();

    const addedCount = addExtractedJobsToState(
      [
        {
          sourceJobId: "linkedin_detail_1",
          canonicalUrl: "https://www.linkedin.com/jobs/view/4404542575/",
          title: "Full Stack Developer (AI-First)",
          company: "Full Circle Agency",
          location: "Prishtina (Remote)",
          description: "First copy.",
          salaryText: null,
          summary: "First copy.",
          postedAt: null,
          workMode: ["remote"],
          applyPath: "unknown",
          easyApplyEligible: false,
          keySkills: [],
        },
        {
          sourceJobId: "linkedin_detail_2",
          canonicalUrl: "https://www.linkedin.com/jobs/view/4404542575/",
          title: "Full Stack Developer (AI-First)",
          company: "Full Circle Agency",
          location: "Prishtina (Remote)",
          description: "Second copy.",
          salaryText: null,
          summary: "Second copy.",
          postedAt: null,
          workMode: ["remote"],
          applyPath: "unknown",
          easyApplyEligible: false,
          keySkills: [],
        },
      ],
      state,
      "target_site",
    );

    expect(addedCount).toBe(1);
    expect(state.collectedJobs).toHaveLength(1);
    expect(state.collectedJobs[0]).toEqual(
      expect.objectContaining({
        sourceJobId: "linkedin_detail_2",
        description: "Second copy.",
      }),
    );
  });

  test("upgrades an earlier weak duplicate when a later extraction finds a stronger version of the same LinkedIn job", () => {
    const state = createState();

    const initialAddedCount = addExtractedJobsToState(
      [
        {
          sourceJobId: "linkedin_detail_weak",
          canonicalUrl: "https://www.linkedin.com/jobs/view/4404542575/",
          title: "Full Stack Engineer",
          company: "Full Stack Engineer Confidential",
          location: "Kosovo (Remote)",
          description: "Weak first copy.",
          salaryText: null,
          summary: "Weak first copy.",
          postedAt: null,
          workMode: ["remote"],
          applyPath: "unknown",
          easyApplyEligible: false,
          keySkills: [],
        },
      ],
      state,
      "target_site",
    );

    const replacementAddedCount = addExtractedJobsToState(
      [
        {
          sourceJobId: "linkedin_detail_better",
          canonicalUrl: "https://www.linkedin.com/jobs/view/4404542575/",
          title: "Full Stack Developer (AI-First)",
          company: "Full Circle Agency",
          location: "Prishtina (Remote)",
          description: "Stronger later copy.",
          salaryText: null,
          summary: "Stronger later copy.",
          postedAt: null,
          workMode: ["remote"],
          applyPath: "unknown",
          easyApplyEligible: false,
          keySkills: ["TypeScript", "React"],
          responsibilities: ["Build AI-first product features."],
        },
      ],
      state,
      "target_site",
    );

    expect(initialAddedCount).toBe(1);
    expect(replacementAddedCount).toBe(0);
    expect(state.collectedJobs).toHaveLength(1);
    expect(state.collectedJobs[0]).toEqual(
      expect.objectContaining({
        sourceJobId: "linkedin_detail_better",
        canonicalUrl: "https://www.linkedin.com/jobs/view/4404542575/",
        title: "Full Stack Developer (AI-First)",
        company: "Full Circle Agency",
        location: "Prishtina (Remote)",
        keySkills: ["TypeScript", "React"],
        responsibilities: ["Build AI-first product features."],
      }),
    );
  });
});

describe("scoreCollectedJobQuality", () => {
  test("penalizes repeated leading title phrases", () => {
    const normalScore = scoreCollectedJobQuality(createJob());
    const repeatedScore = scoreCollectedJobQuality(
      createJob({
        title: "Staff Frontend Engineer Staff Frontend Engineer",
      }),
    );

    expect(repeatedScore).toBeLessThan(normalScore - 100);
  });

  test("penalizes single-word titles", () => {
    const normalScore = scoreCollectedJobQuality(createJob());
    const singleWordScore = scoreCollectedJobQuality(
      createJob({ title: "Engineer" }),
    );

    expect(singleWordScore).toBeLessThan(normalScore);
  });

  test("penalizes UI-noise tokens in title and company", () => {
    const normalScore = scoreCollectedJobQuality(createJob());
    const noisyTitleScore = scoreCollectedJobQuality(
      createJob({
        title: "Dismiss Staff Frontend Engineer viewed",
      }),
    );
    const noisyCompanyScore = scoreCollectedJobQuality(
      createJob({
        company: "Signal Systems with verification",
      }),
    );

    expect(noisyTitleScore).toBeLessThan(normalScore);
    expect(noisyCompanyScore).toBeLessThan(normalScore);
  });

  test("penalizes title and company containment signals", () => {
    const normalScore = scoreCollectedJobQuality(createJob());
    const companyContainsTitleScore = scoreCollectedJobQuality(
      createJob({
        title: "Frontend Engineer",
        company: "Frontend Engineer Confidential",
      }),
    );
    const titleContainsCompanyScore = scoreCollectedJobQuality(
      createJob({
        title: "Signal Systems Staff Engineer",
        company: "Signal Systems",
      }),
    );

    expect(companyContainsTitleScore).toBeLessThan(normalScore);
    expect(titleContainsCompanyScore).toBeLessThan(normalScore);
  });

  test("rewards structured fields and easy-apply evidence", () => {
    const sparseScore = scoreCollectedJobQuality(createJob());
    const richScore = scoreCollectedJobQuality(
      createJob({
        description:
          "Build product experiences for a complex platform with clear ownership and cross-functional collaboration.",
        summary: "Build product experiences for a complex platform.",
        keySkills: ["React", "TypeScript"],
        responsibilities: ["Own the frontend architecture."],
        minimumQualifications: ["5 years of product engineering experience."],
        preferredQualifications: ["Electron experience."],
        easyApplyEligible: true,
      }),
    );

    expect(richScore).toBeGreaterThan(sparseScore + 50);
  });
});
