// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, it } from "vitest";
import { CandidateProfileSchema } from "@unemployed/contracts";
import {
  createProfileEditorValues,
  type ProfileEditorValues,
} from "../../lib/profile-editor";
import { ProfileCoreTab } from "./profile-core-tab";

const profile = CandidateProfileSchema.parse({
  id: "candidate_accessibility",
  firstName: "Alex",
  lastName: "Vanguard",
  fullName: "Alex Vanguard",
  headline: "Platform engineer",
  summary: "Builds dependable systems.",
  currentLocation: "Prishtina, Kosovo",
  yearsExperience: 7,
  email: "alex@example.com",
  baseResume: {
    id: "resume_accessibility",
    fileName: "alex.pdf",
    uploadedAt: "2026-08-23T09:00:00.000Z",
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

function ProfileCoreHarness() {
  const profileForm = useForm<ProfileEditorValues>({
    defaultValues: createProfileEditorValues(profile),
  });

  return <ProfileCoreTab profileForm={profileForm} />;
}

describe("ProfileCoreTab accessibility", () => {
  afterEach(cleanup);

  it("keeps formerly implicit identity and narrative fields explicitly named", () => {
    const { container } = render(<ProfileCoreHarness />);

    expect(screen.getByLabelText("First name").id).toBe(
      "profile-core-field-first-name",
    );
    expect(screen.getByLabelText("Displayed location").id).toBe(
      "profile-core-field-displayed-location",
    );
    expect(screen.getByLabelText("Professional story").id).toBe(
      "profile-core-field-professional-story",
    );
    expect(screen.getByLabelText("Motivation themes").id).toBe(
      "profile-core-field-motivation-themes",
    );
    expect(container.querySelector("label label")).toBeNull();
  });
});
