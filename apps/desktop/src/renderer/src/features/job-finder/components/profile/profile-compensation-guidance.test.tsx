// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useFieldArray, useForm } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CandidateProfileSchema,
  JobSearchPreferencesSchema,
} from "@unemployed/contracts";
import {
  createProfileEditorValues,
  createSearchPreferencesEditorValues,
  type ProfileEditorValues,
  type SearchPreferencesEditorValues,
} from "../../lib/profile-editor";
import { ProfilePreferencesEligibilitySection } from "./profile-preferences-eligibility-section";
import { ProfilePreferencesTargetingSection } from "./profile-preferences-sections";

const profile = CandidateProfileSchema.parse({
  id: "candidate_compensation_guidance",
  firstName: "Alex",
  lastName: "Vanguard",
  fullName: "Alex Vanguard",
  headline: "Software engineer",
  summary: "Builds dependable products.",
  currentLocation: "Prishtina, Kosovo",
  yearsExperience: 7,
  workEligibility: {},
  professionalSummary: {},
  narrative: {},
  baseResume: {
    id: "resume_compensation_guidance",
    fileName: "alex.pdf",
    uploadedAt: "2026-08-11T10:00:00.000Z",
    extractionStatus: "ready",
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
  targetRoles: [],
  minimumSalaryUsd: null,
  approvalMode: "review_before_submit",
  tailoringMode: "balanced",
  discovery: { targets: [] },
});

function TargetingHarness() {
  const preferencesForm = useForm<SearchPreferencesEditorValues>({
    defaultValues: createSearchPreferencesEditorValues(preferences),
  });

  return (
    <ProfilePreferencesTargetingSection preferencesForm={preferencesForm} />
  );
}

function EligibilityHarness() {
  const profileForm = useForm<ProfileEditorValues>({
    defaultValues: createProfileEditorValues(profile),
  });
  const customAnswerArray = useFieldArray({
    control: profileForm.control,
    keyName: "fieldKey",
    name: "answerBank.customAnswers",
  });

  return (
    <ProfilePreferencesEligibilitySection
      busy={false}
      customAnswerArray={customAnswerArray}
      profileForm={profileForm}
    />
  );
}

describe("profile compensation guidance", () => {
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
  });

  it("distinguishes the matching floor and opens the expected application answer", () => {
    render(<TargetingHarness />);

    expect(container?.textContent).toContain("Minimum worth considering");
    expect(container?.textContent).toContain("Search range maximum (optional)");
    expect(container?.textContent).toContain(
      "The minimum is your consideration floor",
    );
    const answerLink = container?.querySelector<HTMLAnchorElement>(
      'a[href="#profile-expected-salary-answer-field"]',
    );
    expect(answerLink).toBeTruthy();

    const answerField = document.createElement("textarea");
    const scrollIntoView = vi.fn();
    const focus = vi.fn();
    answerField.id = "profile-expected-salary-answer";
    answerField.scrollIntoView = scrollIntoView;
    answerField.focus = focus;
    document.body.appendChild(answerField);

    act(() => answerLink?.click());

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    answerField.remove();
  });

  it("labels the reusable salary response as an application answer", () => {
    render(<EligibilityHarness />);

    const field = container?.querySelector<HTMLTextAreaElement>(
      "#profile-expected-salary-answer",
    );
    expect(field).toBeTruthy();
    expect(container?.textContent).toContain(
      "Expected salary answer (applications)",
    );
    expect(container?.textContent).toContain(
      "It may be higher than your minimum job-search floor",
    );
  });
});
