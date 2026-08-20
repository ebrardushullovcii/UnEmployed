// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it } from "vitest";
import {
  CandidateProfileSchema,
  JobSearchPreferencesSchema,
} from "@unemployed/contracts";
import {
  createProfileEditorValues,
  createSearchPreferencesEditorValues,
  type ProfileEditorValues,
  type SearchPreferencesEditorValues,
} from "../../../lib/profile-editor";
import type { DiscoveryTargetEditorValue } from "../../../lib/job-finder-types";
import {
  isValidProfileSetupSourceUrl,
  PROFILE_SETUP_SOURCE_PAGE_SIZE,
} from "./profile-setup-screen-helpers";
import { ProfileSetupTargetingStep } from "./profile-setup-step-sections";

const profile = CandidateProfileSchema.parse({
  id: "candidate_setup_sources_scale",
  firstName: "Alex",
  lastName: "Vanguard",
  fullName: "Alex Vanguard",
  headline: "Platform engineer",
  summary: "Builds dependable systems.",
  currentLocation: "Prishtina, Kosovo",
  yearsExperience: 7,
  email: "alex@example.com",
  baseResume: {
    id: "resume_setup_sources_scale",
    fileName: "alex.pdf",
    uploadedAt: "2026-07-16T09:00:00.000Z",
    extractionStatus: "ready",
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

function createTarget(index: number): DiscoveryTargetEditorValue {
  const sourceNumber = index.toString().padStart(3, "0");

  return {
    id: `setup_target_${sourceNumber}`,
    label: `Source ${sourceNumber}`,
    startingUrl: `https://jobs-${index}.example.com/openings`,
    enabled: index === 1 || index === 511,
    adapterKind: "auto",
    customInstructions: "",
    instructionStatus: "missing",
    validatedInstructionId: null,
    draftInstructionId: null,
    lastDebugRunId: null,
    lastVerifiedAt: null,
    staleReason: null,
  };
}

function SetupSourcesHarness() {
  const profileForm = useForm<ProfileEditorValues>({
    defaultValues: createProfileEditorValues(profile),
  });
  const preferences = JobSearchPreferencesSchema.parse({
    targetRoles: [],
    minimumSalaryUsd: null,
    approvalMode: "review_before_submit",
    tailoringMode: "balanced",
    discovery: { targets: [] },
  });
  const preferencesForm = useForm<SearchPreferencesEditorValues>({
    defaultValues: {
      ...createSearchPreferencesEditorValues(preferences),
      discoveryTargets: Array.from({ length: 511 }, (_, index) =>
        createTarget(index + 1),
      ),
    },
  });

  return (
    <ProfileSetupTargetingStep
      nextStep="narrative"
      onSaveAndGoToStep={() => undefined}
      preferencesForm={preferencesForm}
      profileForm={profileForm}
      renderFooter={() => null}
    />
  );
}

describe("ProfileSetupTargetingStep source scale", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps 511 sources bounded, searchable, editable, and validation-aware", async () => {
    const { container } = render(<SetupSourcesHarness />);

    expect(
      container.querySelectorAll("[data-profile-setup-source-card]"),
    ).toHaveLength(PROFILE_SETUP_SOURCE_PAGE_SIZE);
    expect(screen.getByText("1–25 of 511")).toBeTruthy();
    expect(screen.getByText("Source 001")).toBeTruthy();
    expect(screen.queryByText("Source 026")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("26–50 of 511")).toBeTruthy();
    expect(screen.getByText("Source 026")).toBeTruthy();
    expect(screen.queryByText("Source 001")).toBeNull();

    const searchInput = screen.getByRole("searchbox", {
      name: "Find a source",
    });
    fireEvent.change(searchInput, { target: { value: "source 511" } });
    expect(await screen.findByText("1 of 511 sources")).toBeTruthy();
    expect(screen.getByText("Source 511")).toBeTruthy();

    const sourceUrlInput = screen.getByLabelText("Careers or job-board URL");
    expect(isValidProfileSetupSourceUrl("not-a-url")).toBe(false);
    fireEvent.change(sourceUrlInput, { target: { value: "not-a-url" } });
    await waitFor(() =>
      expect(sourceUrlInput.getAttribute("aria-invalid")).toBe("true"),
    );
    expect(sourceUrlInput.getAttribute("aria-describedby")).toBe(
      "profile-setup-source-url-error-setup_target_511",
    );
    expect(
      screen.getByText(
        "Enter a complete http or https URL before this source can be used.",
      ),
    ).toBeTruthy();

    fireEvent.change(searchInput, { target: { value: "not-a-url" } });
    await waitFor(() =>
      expect(
        screen
          .getByLabelText("Careers or job-board URL")
          .getAttribute("aria-invalid"),
      ).toBe("true"),
    );
    fireEvent.change(screen.getByLabelText("Source name"), {
      target: { value: "Final source" },
    });
    fireEvent.change(searchInput, { target: { value: "final source" } });
    expect(await screen.findByDisplayValue("Final source")).toBeTruthy();
    await waitFor(() =>
      expect(
        screen
          .getByLabelText("Careers or job-board URL")
          .getAttribute("aria-invalid"),
      ).toBe("true"),
    );
  });
});
