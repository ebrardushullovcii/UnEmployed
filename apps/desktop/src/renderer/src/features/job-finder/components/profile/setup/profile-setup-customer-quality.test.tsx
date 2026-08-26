// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useFieldArray, useForm } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CandidateProfileSchema,
  createFreshStartCandidateProfile,
  evaluateProfileSetupReadiness,
  JobSearchPreferencesSchema,
} from "@unemployed/contracts";
import {
  createProfileEditorValues,
  createSearchPreferencesEditorValues,
  type ProfileEditorValues,
  type SearchPreferencesEditorValues,
} from "../../../lib/profile-editor";
import { ProfileSetupPathCard } from "./profile-setup-screen-sections";
import { ProfileSetupAnswersStep } from "./profile-setup-step-sections-extra";
import { ProfileSetupTargetingStep } from "./profile-setup-step-sections";

const profile = CandidateProfileSchema.parse({
  id: "candidate_quality",
  firstName: "Alex",
  lastName: "Vanguard",
  fullName: "Alex Vanguard",
  headline: "Platform engineer",
  summary: "Builds dependable systems.",
  currentLocation: "Prishtina, Kosovo",
  yearsExperience: 7,
  email: "alex@example.com",
  baseResume: {
    id: "resume_quality",
    fileName: "alex.pdf",
    uploadedAt: "2026-07-16T09:00:00.000Z",
    extractionStatus: "ready",
  },
  workEligibility: {},
  professionalSummary: {},
  narrative: {
    professionalStory:
      "I build dependable products with cross-functional teams.",
    careerTransitionSummary:
      "I am moving from platform delivery into applied AI products.",
  },
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
const preferences = JobSearchPreferencesSchema.parse({
  targetRoles: ["Senior Software Engineer"],
  jobFamilies: [],
  locations: [],
  excludedLocations: [],
  workModes: [],
  seniorityLevels: [],
  targetIndustries: [],
  targetCompanyStages: [],
  employmentTypes: [],
  minimumSalaryUsd: null,
  targetSalaryUsd: null,
  salaryCurrency: "USD",
  approvalMode: "review_before_submit",
  tailoringMode: "balanced",
  companyBlacklist: [],
  companyWhitelist: [],
  discovery: { historyLimit: 5, targets: [] },
});
const untouchedPreferences = JobSearchPreferencesSchema.parse({
  targetRoles: [],
  jobFamilies: [],
  locations: [],
  excludedLocations: [],
  workModes: [],
  seniorityLevels: [],
  targetIndustries: [],
  targetCompanyStages: [],
  employmentTypes: [],
  minimumSalaryUsd: null,
  targetSalaryUsd: null,
  salaryCurrency: "USD",
  approvalMode: "review_before_submit",
  tailoringMode: "balanced",
  companyBlacklist: [],
  companyWhitelist: [],
  discovery: { historyLimit: 5, targets: [] },
});

function FormHarness(props: { screen: "answers" | "targeting" }) {
  const profileForm = useForm<ProfileEditorValues>({
    defaultValues: createProfileEditorValues(profile),
  });
  const preferencesForm = useForm<SearchPreferencesEditorValues>({
    defaultValues: createSearchPreferencesEditorValues(preferences),
  });
  const customAnswerArray = useFieldArray({
    control: profileForm.control,
    keyName: "fieldKey",
    name: "answerBank.customAnswers",
  });

  if (props.screen === "targeting") {
    return (
      <>
        <ProfileSetupTargetingStep
          nextStep="narrative"
          onSaveAndGoToStep={vi.fn()}
          preferencesForm={preferencesForm}
          profileForm={profileForm}
          renderFooter={() => null}
        />
        <output data-tailoring-mode={preferencesForm.watch("tailoringMode")}>
          {preferencesForm.watch("tailoringMode")}
        </output>
      </>
    );
  }

  return (
    <ProfileSetupAnswersStep
      backgroundArrays={{ customAnswerArray } as never}
      isProfileSetupPending={false}
      nextStep="ready_check"
      onSaveAndGoToStep={vi.fn()}
      profileForm={profileForm}
      renderFooter={() => null}
    />
  );
}

describe("profile setup customer-quality guidance", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  function render(node: ReactNode) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root?.render(node));
  }

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    root = null;
    container?.remove();
    container = null;
    vi.clearAllMocks();
  });

  it("keeps pending review counts visible instead of presenting a contradictory completed step", () => {
    render(
      <ProfileSetupPathCard
        currentStep="targeting"
        onGoToStep={vi.fn()}
        profileSetupState={{
          status: "in_progress",
          currentStep: "targeting",
          completedAt: null,
          lastResumedAt: null,
          reviewItems: [
            {
              id: "review_location",
              step: "essentials",
              target: {
                domain: "identity",
                key: "currentLocation",
                recordId: null,
              },
              label: "Current location",
              reason: "Confirm the imported value.",
              severity: "recommended",
              status: "pending",
              proposedValue: "Prishtina, Kosovo",
              sourceSnippet: null,
              sourceCandidateId: null,
              sourceRunId: null,
              createdAt: "2026-07-16T10:00:00.000Z",
              resolvedAt: null,
            },
          ],
        }}
      />,
    );

    expect(container?.textContent).toContain("1 to review");
    expect(container?.textContent).toContain(
      "New imports or edits can add review items here",
    );
    expect(container?.textContent).not.toContain("Needs review");
  });

  it("only badges setup path rows whose own domain content exists after jumping to ready check", () => {
    function getSetupPathRowText(label: string): string {
      const row = Array.from(container?.querySelectorAll("button") ?? []).find(
        (entry) => entry.textContent?.includes(label),
      );
      return row?.textContent ?? "";
    }

    // Blitz-click chronology: landing on ready check with the untouched
    // first-run profile must not mint a single Complete badge.
    render(
      <ProfileSetupPathCard
        currentStep="ready_check"
        hasImportedResume={false}
        onGoToStep={vi.fn()}
        profileSetupState={{
          status: "in_progress",
          currentStep: "ready_check",
          completedAt: null,
          lastResumedAt: null,
          reviewItems: [],
        }}
        readiness={evaluateProfileSetupReadiness(
          createFreshStartCandidateProfile(),
          untouchedPreferences,
        )}
      />,
    );

    expect(container?.textContent).not.toContain("Complete");

    // Genuinely satisfied rows stay complete while untouched ones stay open.
    render(
      <ProfileSetupPathCard
        currentStep="ready_check"
        hasImportedResume={true}
        onGoToStep={vi.fn()}
        profileSetupState={{
          status: "in_progress",
          currentStep: "ready_check",
          completedAt: null,
          lastResumedAt: null,
          reviewItems: [],
        }}
        readiness={evaluateProfileSetupReadiness(profile, preferences)}
      />,
    );

    expect(getSetupPathRowText("Import")).toContain("Complete");
    expect(getSetupPathRowText("Essentials")).toContain("Complete");
    expect(getSetupPathRowText("Narrative")).toContain("Complete");
    expect(getSetupPathRowText("Background")).not.toContain("Complete");
    expect(getSetupPathRowText("Targeting")).not.toContain("Complete");
    expect(getSetupPathRowText("Answers")).not.toContain("Complete");
  });

  it("explains that preferred work mode and remote eligibility are separate", () => {
    render(<FormHarness screen="targeting" />);

    expect(container?.textContent).toContain(
      "Choose at least one work mode before relying on discovery results.",
    );
    expect(container?.textContent).toContain(
      "A city and country entered together stay one location.",
    );
    expect(
      container?.querySelector<HTMLInputElement>(
        "#profile-setup-field-search-preferences-locations",
      )?.placeholder,
    ).toBe("Example: Prishtina, Kosovo");
    const workModes = container?.querySelector(
      "#profile-setup-field-search-preferences-work-modes",
    );
    const guidanceId = workModes?.getAttribute("aria-describedby");
    expect(guidanceId).toBe(
      "profile-setup-field-search-preferences-work-modes-guidance",
    );
    expect(container?.querySelector(`#${guidanceId}`)).toBeTruthy();
  });

  it("makes aggressive resume tailoring an explicit, review-required choice", () => {
    render(<FormHarness screen="targeting" />);

    expect(container?.textContent).toContain(
      "How strongly should Job Finder tailor each resume?",
    );
    expect(container?.textContent).toContain("Light edit");
    expect(container?.textContent).toContain("Balanced rewrite");
    expect(container?.textContent).toContain("Strong rewrite");
    expect(container?.textContent).toContain(
      "This sets the default for reusable resume strategies and per-job drafts.",
    );
    expect(container?.textContent).toContain("Review every generated line");
    expect(container?.textContent).toContain(
      "new facts and numbers are never invented",
    );

    const balanced = container?.querySelector<HTMLInputElement>(
      'input[value="balanced"]',
    );
    const aggressive = container?.querySelector<HTMLInputElement>(
      'input[value="aggressive"]',
    );
    expect(balanced?.checked).toBe(true);
    expect(aggressive?.checked).toBe(false);

    act(() => {
      aggressive?.click();
    });

    expect(aggressive?.checked).toBe(true);
    expect(
      container?.querySelector("output[data-tailoring-mode]")?.textContent,
    ).toBe("aggressive");
    expect(container?.textContent).toContain(
      "Strong rewrite can substantially rewrite, combine, or elaborate supported experience.",
    );
    expect(container?.textContent).toContain(
      "does not auto-approve or submit applications",
    );
  });

  it("reuses saved narrative deliberately when answer fields are empty", () => {
    render(<FormHarness screen="answers" />);

    const useStory = [...(container?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Use professional story",
    );
    const useTransition = [
      ...(container?.querySelectorAll("button") ?? []),
    ].find((button) => button.textContent === "Use transition summary");
    expect(useStory).toBeTruthy();
    expect(useTransition).toBeTruthy();

    act(() => {
      useStory?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      useTransition?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const selfIntroduction = container?.querySelector<HTMLTextAreaElement>(
      "#profile-setup-field-answer-bank-self-introduction",
    );
    const careerTransition = container?.querySelector<HTMLTextAreaElement>(
      "#profile-setup-field-answer-bank-career-transition",
    );
    expect(selfIntroduction?.value).toBe(
      "I build dependable products with cross-functional teams.",
    );
    expect(careerTransition?.value).toBe(
      "I am moving from platform delivery into applied AI products.",
    );
  });

  it("associates every reusable-answer label with its field", () => {
    render(<FormHarness screen="answers" />);

    const addAnswer = [...(container?.querySelectorAll("button") ?? [])].find(
      (button) => button.textContent === "Add answer",
    );
    act(() => {
      addAnswer?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    for (const fieldName of ["label", "kind", "question", "answer"]) {
      const field = container?.querySelector<HTMLElement>(
        `[name="answerBank.customAnswers.0.${fieldName}"]`,
      );
      const fieldId = field?.id;
      expect(fieldId).toBeTruthy();
      expect(container?.querySelector(`label[for="${fieldId}"]`)).toBeTruthy();
    }
  });
});
