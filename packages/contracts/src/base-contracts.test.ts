import { describe, expect, test } from "vitest";
import {
  ApplyJobStateSchema,
  ApplyRunModeSchema,
  ApplyRunStateSchema,
  ApplySubmitApprovalStatusSchema,
  ApplicationStatusSchema,
  CandidateProfileSchema,
  DesktopWindowControlsStateSchema,
  JobSearchPreferencesSchema,
  SourceAccessPromptStateSchema,
  WorkModeListSchema,
  applicationStatusValues,
  sourceAccessPromptStateValues,
} from "./index";

describe("contracts base schemas", () => {
  test("supports the full application status list", () => {
    expect(applicationStatusValues).toContain("submitted");
    expect(ApplicationStatusSchema.parse("interview")).toBe("interview");
  });

  test("parses staged apply foundation enums", () => {
    expect(ApplyRunModeSchema.parse("copilot")).toBe("copilot");
    expect(ApplyRunStateSchema.parse("paused_for_user_review")).toBe(
      "paused_for_user_review",
    );
    expect(ApplyJobStateSchema.parse("awaiting_review")).toBe("awaiting_review");
    expect(ApplySubmitApprovalStatusSchema.parse("approved")).toBe("approved");
    expect(SourceAccessPromptStateSchema.parse("login_required")).toBe(
      "login_required",
    );
  });

  test("supports the full source access prompt state list", () => {
    expect(sourceAccessPromptStateValues).toEqual([
      "login_required",
      "login_recommended",
    ]);
    expect(SourceAccessPromptStateSchema.parse("login_recommended")).toBe(
      "login_recommended",
    );
  });

  test("rejects invalid apply foundation enum values", () => {
    expect(() => ApplyRunModeSchema.parse("invalid_mode")).toThrow();
    expect(() => ApplyRunStateSchema.parse("bad_state")).toThrow();
    expect(() => ApplyJobStateSchema.parse("unknown")).toThrow();
    expect(() => ApplySubmitApprovalStatusSchema.parse("maybe")).toThrow();
  });

  test("parses an expanded candidate profile", () => {
    const profile = CandidateProfileSchema.parse({
      id: "candidate_1",
      firstName: "Alex",
      lastName: "Vanguard",
      middleName: null,
      fullName: "Alex Vanguard",
      headline: "Full-stack engineer",
      summary: "Builds reliable user-facing systems.",
      currentLocation: "London, UK",
      yearsExperience: 8,
      baseResume: {
        id: "resume_1",
        fileName: "alex-vanguard.pdf",
        uploadedAt: "2026-03-20T10:00:00.000Z",
        storagePath: "/tmp/alex-vanguard.pdf",
      },
      targetRoles: ["Frontend Engineer"],
      experiences: [],
      education: [],
      certifications: [],
      links: [],
      projects: [],
      spokenLanguages: [],
    });

    expect(profile.baseResume.storagePath).toBe("/tmp/alex-vanguard.pdf");
    expect(profile.baseResume.extractionStatus).toBe("not_started");
    expect(profile.email).toBeNull();
    expect(profile.locations).toEqual([]);
    expect(profile.skills).toEqual([]);
    expect(profile.experiences).toEqual([]);
    expect(profile.education).toEqual([]);
  });

  test("applies defaults for job search preferences", () => {
    const preferences = JobSearchPreferencesSchema.parse({
      approvalMode: "review_before_submit",
      tailoringMode: "balanced",
      minimumSalaryUsd: null,
    });

    expect(preferences.companyBlacklist).toEqual([]);
    expect(preferences.workModes).toEqual([]);
  });

  test("parses discovery targets with optional custom instructions", () => {
    const preferences = JobSearchPreferencesSchema.parse({
      approvalMode: "review_before_submit",
      tailoringMode: "balanced",
      minimumSalaryUsd: null,
      discovery: {
        targets: [
          {
            id: "target_1",
            label: "Primary target",
            startingUrl: "https://jobs.example.com/search",
            enabled: true,
            adapterKind: "auto",
            customInstructions:
              "Open the job cards from the homepage list before extracting details.",
          },
        ],
      },
    });

    expect(preferences.discovery.targets[0]?.customInstructions).toBe(
      "Open the job cards from the homepage list before extracting details.",
    );
    expect(preferences.discovery.targets[0]?.instructionStatus).toBe("missing");
    expect(preferences.discovery.targets[0]?.validatedInstructionId).toBeNull();
  });

  test("rejects malformed link metadata and url fields", () => {
    expect(() =>
      CandidateProfileSchema.parse({
        id: "candidate_1",
        firstName: "Alex",
        lastName: "Vanguard",
        middleName: null,
        fullName: "Alex Vanguard",
        headline: "Full-stack engineer",
        summary: "Builds reliable user-facing systems.",
        currentLocation: "London, UK",
        yearsExperience: 8,
        baseResume: {
          id: "resume_1",
          fileName: "alex-vanguard.pdf",
          uploadedAt: "2026-03-20T10:00:00.000Z",
          storagePath: "/tmp/alex-vanguard.pdf",
        },
        links: [
          {
            id: "link_1",
            label: "Portfolio",
            url: "not-a-url",
            kind: "custom",
          },
        ],
      }),
    ).toThrow();
  });

  test("parses desktop window controls state", () => {
    const controlsState = DesktopWindowControlsStateSchema.parse({
      isMaximized: false,
      isMinimizable: true,
      isClosable: true,
    });

    expect(controlsState.isClosable).toBe(true);
  });

  test("normalizes legacy onsite work mode spellings", () => {
    expect(WorkModeListSchema.parse(["on-site", "in office", "remote"])).toEqual([
      "onsite",
      "onsite",
      "remote",
    ]);
  });
});
