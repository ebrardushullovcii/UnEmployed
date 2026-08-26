// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CandidateProfileSchema,
  ResumeImportFieldCandidateSummarySchema,
  ResumeImportRunSchema,
} from "@unemployed/contracts";
import { ProfileResumePanel } from "./profile-resume-panel";

describe("ProfileResumePanel", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }

    root = null;
    container?.remove();
    container = null;
    vi.clearAllMocks();
  });

  it("keeps the untouched workspace in a truthful not-imported state", () => {
    const profile = CandidateProfileSchema.parse({
      id: "candidate_fresh_start",
      firstName: "New",
      lastName: "Candidate",
      fullName: "New Candidate",
      headline: "Import your resume to begin",
      summary:
        "Import a resume or paste resume text to build your profile, targeting, and tailored documents.",
      currentLocation: "Set your preferred location",
      yearsExperience: 0,
      baseResume: {
        id: "resume_fresh_start",
        fileName: "No resume imported yet",
        uploadedAt: new Date(0).toISOString(),
        textContent: null,
        extractionStatus: "needs_text",
      },
      workEligibility: {},
      professionalSummary: {},
      targetRoles: [],
      locations: [],
      skills: [],
      experiences: [],
      education: [],
      certifications: [],
      links: [],
      projects: [],
      spokenLanguages: [],
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <ProfileResumePanel
          importDisabledReason={null}
          isAnalyzeProfilePending={false}
          isImportResumePending={false}
          latestResumeImportReviewCandidates={[]}
          resumeImportProgress={null}
          latestResumeImportRun={null}
          onAnalyzeProfileFromResume={vi.fn()}
          onApplyTimelineRepairAction={vi.fn()}
          onImportResume={vi.fn()}
          profile={profile}
        />,
      );
    });

    expect(container?.textContent).toContain(
      "Import your resume to fill in your profile faster",
    );
    expect(container?.textContent).toContain("Not imported");
    expect(container?.textContent).toContain("Profile details");
    expect(container?.textContent).not.toContain("Imported 01 Jan 1970");
    expect(container?.textContent).not.toContain(
      "This resume needs cleaner text",
    );
  });

  it("disables resume import and refresh while a draft would be overwritten", () => {
    const profile = CandidateProfileSchema.parse({
      id: "candidate_1",
      firstName: "Alex",
      lastName: "Vanguard",
      fullName: "Alex Vanguard",
      headline: "Senior systems designer",
      summary: "Builds resilient workflows.",
      currentLocation: "London, UK",
      yearsExperience: 10,
      email: "alex@example.com",
      phone: "+44 7700 900123",
      baseResume: {
        id: "resume_1",
        fileName: "alex-vanguard.txt",
        uploadedAt: "2026-03-20T10:00:00.000Z",
        textContent: "Alex Vanguard",
        extractionStatus: "ready",
      },
      workEligibility: {},
      professionalSummary: {},
      targetRoles: ["Principal Designer"],
      locations: ["Remote"],
      skills: ["Figma"],
      experiences: [],
      education: [],
      certifications: [],
      links: [],
      projects: [],
      spokenLanguages: [],
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <ProfileResumePanel
          importDisabledReason="Save your current profile or setup draft before importing or refreshing from resume so those unsaved edits do not get overwritten."
          isAnalyzeProfilePending={false}
          isImportResumePending={false}
          latestResumeImportReviewCandidates={[]}
          resumeImportProgress={null}
          latestResumeImportRun={null}
          onAnalyzeProfileFromResume={vi.fn()}
          onApplyTimelineRepairAction={vi.fn()}
          onImportResume={vi.fn()}
          profile={profile}
        />,
      );
    });

    const buttons = [...(container?.querySelectorAll("button") ?? [])];
    expect(buttons.map((button) => button.textContent?.trim())).toEqual(
      expect.arrayContaining(["Replace resume", "Refresh from resume"]),
    );
    expect(buttons.every((button) => button.hasAttribute("disabled"))).toBe(
      true,
    );
    expect(container?.textContent).toContain(
      "Save your current profile or setup draft before importing or refreshing from resume so those unsaved edits do not get overwritten.",
    );
  });

  it("keeps a visible fallback import quality note even when raw low-level warnings are hidden", () => {
    const profile = CandidateProfileSchema.parse({
      id: "candidate_2",
      firstName: "Alex",
      lastName: "Vanguard",
      fullName: "Alex Vanguard",
      headline: "Senior systems designer",
      summary: "Builds resilient workflows.",
      currentLocation: "London, UK",
      yearsExperience: 10,
      email: "alex@example.com",
      phone: "+44 7700 900123",
      baseResume: {
        id: "resume_2",
        fileName: "alex-vanguard.txt",
        uploadedAt: "2026-03-20T10:00:00.000Z",
        textContent: "Alex Vanguard",
        extractionStatus: "ready",
        analysisWarnings: [
          "Python resume parser sidecar fallback: Python sidecar unavailable",
          "pdfplumber is unavailable, so PDF import stayed on the lightweight sidecar fallback.",
        ],
      },
      workEligibility: {},
      professionalSummary: {},
      targetRoles: ["Principal Designer"],
      locations: ["Remote"],
      skills: ["Figma"],
      experiences: [],
      education: [],
      certifications: [],
      links: [],
      projects: [],
      spokenLanguages: [],
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <ProfileResumePanel
          importDisabledReason={null}
          isAnalyzeProfilePending={false}
          isImportResumePending={false}
          latestResumeImportReviewCandidates={[]}
          resumeImportProgress={null}
          latestResumeImportRun={null}
          onAnalyzeProfileFromResume={vi.fn()}
          onApplyTimelineRepairAction={vi.fn()}
          onImportResume={vi.fn()}
          profile={profile}
        />,
      );
    });

    expect(container?.textContent).toContain(
      "This import used a fallback parsing path, so review the imported details more closely before saving them.",
    );
    expect(container?.textContent).not.toContain(
      "Python resume parser sidecar fallback: Python sidecar unavailable",
    );
  });

  it("shows import ready to use when only optional resume suggestions remain", () => {
    const profile = CandidateProfileSchema.parse({
      id: "candidate_3",
      firstName: "Alex",
      lastName: "Vanguard",
      fullName: "Alex Vanguard",
      headline: "Senior systems designer",
      summary: "Builds resilient workflows.",
      currentLocation: "London, UK",
      yearsExperience: 10,
      email: "alex@example.com",
      phone: "+44 7700 900123",
      baseResume: {
        id: "resume_3",
        fileName: "alex-vanguard.txt",
        uploadedAt: "2026-03-20T10:00:00.000Z",
        textContent: "Alex Vanguard",
        extractionStatus: "ready",
        analysisWarnings: [
          "1 optional proof suggestion is available to review before using them in tailored resume narratives.",
        ],
      },
      workEligibility: {},
      professionalSummary: {},
      targetRoles: ["Principal Designer"],
      locations: ["Remote"],
      skills: ["Figma"],
      experiences: [],
      education: [],
      certifications: [],
      links: [],
      projects: [],
      spokenLanguages: [],
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <ProfileResumePanel
          importDisabledReason={null}
          isAnalyzeProfilePending={false}
          isImportResumePending={false}
          latestResumeImportReviewCandidates={[]}
          resumeImportProgress={null}
          latestResumeImportRun={ResumeImportRunSchema.parse({
            id: "resume_import_run_1",
            sourceResumeId: "resume_3",
            sourceResumeFileName: "alex-vanguard.txt",
            trigger: "import",
            status: "applied",
            startedAt: "2026-03-20T10:00:00.000Z",
            completedAt: "2026-03-20T10:00:03.000Z",
            primaryParserKind: "plain_text",
            parserKinds: ["plain_text"],
            analysisProviderKind: "deterministic",
            analysisProviderLabel: "Test AI",
            warnings: [],
            errorMessage: null,
            candidateCounts: {
              total: 1,
              autoApplied: 0,
              needsReview: 1,
              rejected: 0,
              abstained: 0,
            },
          })}
          onAnalyzeProfileFromResume={vi.fn()}
          onApplyTimelineRepairAction={vi.fn()}
          onImportResume={vi.fn()}
          profile={profile}
        />,
      );
    });

    expect(container?.textContent).toContain("Imported into profile");
    expect(container?.textContent).toContain(
      "0 imported automatically; the resume is ready to use.",
    );
    expect(container?.textContent).not.toContain("APPLIED");
  });

  it("replaces placeholder headline copy with an explicit review-needed state after import", () => {
    const profile = CandidateProfileSchema.parse({
      id: "candidate_4",
      firstName: "Alex",
      lastName: "Vanguard",
      fullName: "Alex Vanguard",
      headline: "Import your resume to begin",
      summary:
        "Import a resume or paste resume text to build your profile, targeting, and tailored documents.",
      currentLocation: "London, UK",
      yearsExperience: 10,
      email: "alex@example.com",
      phone: "+44 7700 900123",
      baseResume: {
        id: "resume_4",
        fileName: "alex-vanguard.txt",
        uploadedAt: "2026-03-20T10:00:00.000Z",
        textContent: "Alex Vanguard",
        extractionStatus: "ready",
        analysisWarnings: [
          "17 imported suggestions still need review before the app should rely on it everywhere.",
          "Target headline suggestion",
        ],
      },
      workEligibility: {},
      professionalSummary: {},
      targetRoles: ["Principal Designer"],
      locations: ["Remote"],
      skills: ["Figma"],
      experiences: [],
      education: [],
      certifications: [],
      links: [],
      projects: [],
      spokenLanguages: [],
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <ProfileResumePanel
          importDisabledReason={null}
          isAnalyzeProfilePending={false}
          isImportResumePending={false}
          latestResumeImportReviewCandidates={[
            ResumeImportFieldCandidateSummarySchema.parse({
              id: "candidate_headline",
              target: { section: "identity", key: "headline", recordId: null },
              label: "Target headline suggestion",
              value: "Principal systems designer",
              valuePreview: "Principal systems designer",
              evidenceText: "Principal systems designer",
              confidence: 0.88,
              resolution: "needs_review",
              resolutionReason: null,
              notes: [],
            }),
          ]}
          resumeImportProgress={null}
          latestResumeImportRun={null}
          onAnalyzeProfileFromResume={vi.fn()}
          onApplyTimelineRepairAction={vi.fn()}
          onImportResume={vi.fn()}
          profile={profile}
        />,
      );
    });

    expect(container?.textContent).toContain("Review imported suggestions");
    expect(container?.textContent).toContain("Needs review");
    expect(container?.textContent).toContain("still needs review");
    expect(container?.textContent).toContain("What to confirm next");
    expect(container?.textContent).not.toContain("Headline not set yet");
    expect(container?.textContent).toContain("Target headline suggestion");
    expect(container?.textContent).toContain("Principal systems designer");
    expect(container?.textContent).not.toContain("17 imported suggestions");
    const reviewCard = [...(container?.querySelectorAll("article") ?? [])].find(
      (article) => article.textContent?.includes("Review before saving"),
    );
    expect(reviewCard).toBeDefined();
    expect(
      reviewCard?.textContent?.match(/Target headline suggestion/g),
    ).toHaveLength(1);

    act(() => {
      root?.render(
        <ProfileResumePanel
          importDisabledReason={null}
          isAnalyzeProfilePending={false}
          isImportResumePending={false}
          isProfileReady
          latestResumeImportReviewCandidates={[
            ResumeImportFieldCandidateSummarySchema.parse({
              id: "candidate_headline",
              target: { section: "identity", key: "headline", recordId: null },
              label: "Target headline suggestion",
              value: "Principal systems designer",
              valuePreview: "Principal systems designer",
              evidenceText: "Principal systems designer",
              confidence: 0.88,
              resolution: "needs_review",
              resolutionReason: null,
              notes: [],
            }),
          ]}
          resumeImportProgress={null}
          latestResumeImportRun={null}
          onAnalyzeProfileFromResume={vi.fn()}
          onApplyTimelineRepairAction={vi.fn()}
          onImportResume={vi.fn()}
          profile={profile}
        />,
      );
    });

    expect(container?.textContent).toContain(
      "Resume ready — optional suggestions available",
    );
    expect(container?.textContent).toContain(
      "does not block job search or safe application preparation",
    );
    expect(container?.textContent).toContain("Optional review");
    expect(container?.textContent).toContain("Optional imported suggestions");
    expect(container?.textContent).not.toContain("Needs review");
  });
  it("directs legacy or missing original files to replacement while preserving extracted details", () => {
    const profile = CandidateProfileSchema.parse({
      id: "candidate_missing_source",
      firstName: "Casey",
      lastName: "Rowan",
      fullName: "Casey Rowan",
      headline: "Senior frontend engineer",
      summary: "Builds reliable web products.",
      currentLocation: "Portland, Oregon",
      yearsExperience: 8,
      baseResume: {
        id: "resume_missing_source",
        fileName: "casey.pdf",
        uploadedAt: "2026-07-01T10:00:00.000Z",
        storagePath: null,
        sha256: null,
        textContent: "Casey Rowan\\nSenior frontend engineer",
        extractionStatus: "ready",
      },
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <ProfileResumePanel
          importDisabledReason={null}
          isAnalyzeProfilePending={false}
          isImportResumePending={false}
          latestResumeImportReviewCandidates={[]}
          resumeImportProgress={null}
          latestResumeImportRun={null}
          onAnalyzeProfileFromResume={vi.fn()}
          onApplyTimelineRepairAction={vi.fn()}
          onImportResume={vi.fn()}
          profile={profile}
        />,
      );
    });

    expect(container?.querySelector('[role="alert"]')?.textContent).toContain(
      "saved original resume cannot be verified",
    );
    expect(container?.textContent).toContain("Replace resume");
    expect(container?.textContent).toContain("Casey Rowan");
  });

  it("pins the extraction status badge beside the headline without wrap-induced dead space", () => {
    const profile = CandidateProfileSchema.parse({
      id: "candidate_ready_layout",
      firstName: "Alex",
      lastName: "Vanguard",
      fullName: "Alex Vanguard",
      headline: "Senior systems designer",
      summary: "Builds resilient workflows.",
      currentLocation: "London, UK",
      yearsExperience: 10,
      baseResume: {
        id: "resume_ready_layout",
        fileName: "alex-vanguard.txt",
        uploadedAt: "2026-03-20T10:00:00.000Z",
        textContent: "Alex Vanguard",
        extractionStatus: "ready",
      },
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <ProfileResumePanel
          importDisabledReason={null}
          isAnalyzeProfilePending={false}
          isImportResumePending={false}
          latestResumeImportReviewCandidates={[]}
          resumeImportProgress={null}
          latestResumeImportRun={null}
          onAnalyzeProfileFromResume={vi.fn()}
          onApplyTimelineRepairAction={vi.fn()}
          onImportResume={vi.fn()}
          profile={profile}
        />,
      );
    });

    const statusBadge = [
      ...(container?.querySelectorAll("[data-slot='badge']") ?? []),
    ].find((badge) => badge.textContent?.includes("Ready to review"));
    expect(statusBadge).toBeDefined();

    const badgeRow = statusBadge?.parentElement;
    expect(badgeRow?.className).toContain("grid");
    expect(badgeRow?.className).toContain("grid-cols-[minmax(0,1fr)_auto]");
    expect(badgeRow?.className).toContain("items-start");
    expect(badgeRow?.className).not.toContain("flex-wrap");

    const columnsGrid = badgeRow?.parentElement?.parentElement;
    expect(columnsGrid?.className).toContain("xl:items-start");

    const panelSection = statusBadge?.closest("section");
    expect(panelSection?.className).toContain("py-4 sm:py-5");
    expect(panelSection?.className).not.toContain("px-");
  });
});
