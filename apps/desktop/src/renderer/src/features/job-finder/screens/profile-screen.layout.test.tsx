// @vitest-environment jsdom

import type {
  CandidateProfile,
  JobFinderWorkspaceSnapshot,
  JobSearchPreferences,
  ProfileSetupState,
  ResumeImportFieldCandidateSummary,
  SourceDebugRunDetails,
} from "@unemployed/contracts";
import {
  CandidateProfileSchema,
  JobSearchPreferencesSchema,
} from "@unemployed/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileScreen } from "./profile-screen";

const profile = CandidateProfileSchema.parse({
  id: "candidate_ready",
  firstName: "Ready",
  lastName: "Candidate",
  fullName: "Ready Candidate",
  headline: "Principal systems designer",
  summary: "Builds workflow platforms.",
  currentLocation: "Prishtina",
  yearsExperience: 10,
  baseResume: {
    id: "resume_ready",
    fileName: "resume.pdf",
    uploadedAt: new Date(0).toISOString(),
    textContent: "Experienced designer.",
    extractionStatus: "needs_text",
  },
  workEligibility: {},
  professionalSummary: {},
  targetRoles: [],
  locations: [],
  skills: [],
  experiences: [
    {
      id: "exp_1",
      companyName: "Original Co",
      title: "Designer",
      startDate: "2018-01",
      isCurrent: true,
    },
  ],
  education: [],
  certifications: [],
  links: [],
  projects: [],
  spokenLanguages: [],
});

const searchPreferences = JobSearchPreferencesSchema.parse({
  workModes: ["remote"],
  minimumSalaryUsd: null,
  approvalMode: "review_before_submit",
  tailoringMode: "balanced",
});

const profileSetupState: ProfileSetupState = {
  status: "completed",
  currentStep: "ready_check",
  completedAt: "2026-08-01T00:00:00.000Z",
  reviewItems: [],
  lastResumedAt: null,
};

type ProfileScreenProps = React.ComponentProps<typeof ProfileScreen>;

function buildProfileScreenProps(
  overrides: {
    onSaveAll?: ProfileScreenProps["onSaveAll"];
    profile?: CandidateProfile;
  } = {},
): ProfileScreenProps {
  const props: ProfileScreenProps = {
    actionState: { message: null },
    importResumeGuardMessage: null,
    latestResumeImportReviewCandidates:
      [] as readonly ResumeImportFieldCandidateSummary[],
    latestResumeImportRun: null,
    onApplyProfileCopilotPatchGroup: vi.fn(),
    onApplyResumeTimelineRepairAction: async () => {},
    onAnalyzeProfileFromResume: vi.fn(),
    onGetSourceDebugRunDetails: () =>
      Promise.resolve({} as SourceDebugRunDetails),
    onImportResume: vi.fn(),
    onOpenBrowserSessionForTarget: vi.fn(),
    onProfileSurfaceDirtyChange: vi.fn(),
    profileCopilotPendingContextKey: null,
    onRejectProfileCopilotPatchGroup: vi.fn(),
    onResumeProfileSetup: vi.fn(),
    onRunSourceDebug: vi.fn(),
    onSaveAll: vi.fn(),
    onSaveSourceInstructionArtifact: vi.fn(),
    onSendProfileCopilotMessage: vi.fn(),
    onUndoProfileRevision: vi.fn(),
    onVerifySourceInstructions: vi.fn(),
    pendingActions: {
      analyzeProfile: false,
      browserSession: () => false,
      importResume: false,
      profileCopilotBusy: false,
      profileMutation: false,
      profileSetup: false,
      sourceDebug: () => false,
      sourceInstruction: () => false,
      sourceInstructionVerify: () => false,
      targetDiscovery: () => false,
    },
    profile,
    profileCopilotMessages:
      [] as readonly JobFinderWorkspaceSnapshot["profileCopilotMessages"][number][],
    profileRevisions:
      [] as readonly JobFinderWorkspaceSnapshot["profileRevisions"][number][],
    profileSetupState,
    recentSourceDebugRuns: [],
    resumeImportProgress: null,
    searchPreferences,
    sourceAccessPrompts: [],
    sourceInstructionArtifacts: [],
  };

  if (overrides.onSaveAll) {
    props.onSaveAll = overrides.onSaveAll;
  }

  if (overrides.profile) {
    props.profile = overrides.profile;
  }

  return props;
}

function renderProfileScreen(
  overrides: {
    initialEntry?: string;
    onSaveAll?: ProfileScreenProps["onSaveAll"];
    profile?: CandidateProfile;
  } = {},
): ReturnType<typeof render> {
  return render(
    <MemoryRouter
      initialEntries={[overrides.initialEntry ?? "/job-finder/profile"]}
    >
      <ProfileScreen {...buildProfileScreenProps(overrides)} />
    </MemoryRouter>,
  );
}

describe("ProfileScreen ready-state density and save-bar footprint", () => {
  beforeEach(() => {
    class ResizeObserverStub {
      observe() {}
      disconnect() {}
      unobserve() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    window.localStorage.removeItem(
      "unemployed.profile-ready-banner-dismissed-v1",
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders the compact section panel with a reduced save-bar footprint", () => {
    renderProfileScreen();

    // Ready state keeps the banner path intact.
    expect(screen.getByText("Profile ready")).toBeTruthy();

    // Tab panel content padding is tightened at wide breakpoints.
    const panel = document.getElementById("profile-section-panel");
    expect(panel?.className).toContain("sm:py-3");
    expect(panel?.className).not.toContain("sm:p-4");

    // Section tabs sit closer to the panel.
    const tabsGrid = screen.getByRole("tablist", { name: "Profile sections" })
      .parentElement?.parentElement;
    expect(tabsGrid?.className).toContain("gap-2");
    expect(tabsGrid?.className).not.toContain("--gap-content");

    // The sticky save bar reserves a smaller height through the
    // screen-owned wrapper while keeping the shared footer contract.
    const saveBar = document.querySelector("[data-profile-workspace-actions]");
    expect(saveBar).toBeTruthy();
    expect(saveBar?.parentElement?.className).toContain(
      "[&>[data-profile-workspace-actions]]:py-3",
    );
  });

  it("marks the section panel scroller as the single locked pane scroll region", () => {
    renderProfileScreen();

    const regions = document.querySelectorAll(
      "[data-locked-pane-scroll-region]",
    );
    expect(regions).toHaveLength(1);

    const scrollArea = document.getElementById("profile-section-scroll-area");
    expect(scrollArea).not.toBeNull();
    expect(regions[0]).toBe(scrollArea);
    expect(scrollArea?.className).toContain("overflow-y-auto");
  });

  it("allows changing sections after arriving through a focused deep link", () => {
    renderProfileScreen({
      initialEntry: "/job-finder/profile?section=sources&focus=job-sources",
    });

    fireEvent.click(screen.getByRole("tab", { name: /Preferences/ }));

    expect(
      screen
        .getByRole("tab", { name: /Preferences/ })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByRole("textbox", { name: "Target roles" })).toBeTruthy();
  });

  it("keeps the save path wired from the shared save bar to both payloads", () => {
    const onSaveAll =
      vi.fn<
        (
          profilePayload: CandidateProfile,
          preferencesPayload: JobSearchPreferences,
        ) => void
      >();
    renderProfileScreen({ onSaveAll });

    const headlineInput = document
      .getElementById("profile-section-panel")
      ?.querySelector<HTMLInputElement>('input[name="identity.headline"]');
    expect(headlineInput).toBeTruthy();
    fireEvent.change(headlineInput!, {
      target: { value: "Updated headline" },
    });
    fireEvent.click(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Save changes",
      }),
    );

    expect(onSaveAll).toHaveBeenCalledTimes(1);
    const [savedProfile, savedPreferences] = onSaveAll.mock.calls[0]!;
    expect(savedProfile.fullName).toBe("Ready Candidate");
    expect(savedPreferences.workModes).toContain("remote");
  });

  it("announces a kept-draft background merge and saves merged canonical data", () => {
    const onSaveAll =
      vi.fn<
        (
          profilePayload: CandidateProfile,
          preferencesPayload: JobSearchPreferences,
        ) => void
      >();
    const { rerender } = renderProfileScreen({ onSaveAll });

    const headlineInput = document
      .getElementById("profile-section-panel")
      ?.querySelector<HTMLInputElement>('input[name="identity.headline"]');
    expect(headlineInput).toBeTruthy();
    fireEvent.change(headlineInput!, {
      target: { value: "Kept draft headline" },
    });

    // A meaningful external canonical update lands while the draft is dirty.
    rerender(
      <MemoryRouter initialEntries={["/job-finder/profile"]}>
        <ProfileScreen
          {...buildProfileScreenProps({
            onSaveAll,
            profile: {
              ...profile,
              headline: "External canonical headline",
              currentLocation: "Berlin",
            },
          })}
        />
      </MemoryRouter>,
    );

    const mergeNotice = screen.getByText(/updated in the background/);
    expect(mergeNotice.closest('[role="status"]')).toBeTruthy();
    expect(mergeNotice.textContent).toContain(
      "Your unsaved edits were kept; review the merged fields before saving.",
    );
    expect(
      document
        .getElementById("profile-section-panel")
        ?.querySelector<HTMLInputElement>('input[name="identity.headline"]')
        ?.value,
    ).toBe("Kept draft headline");

    fireEvent.click(
      screen.getByRole<HTMLButtonElement>("button", { name: "Save changes" }),
    );

    expect(onSaveAll).toHaveBeenCalledTimes(1);
    const [mergedProfile] = onSaveAll.mock.calls[0]!;
    expect(mergedProfile.headline).toBe("Kept draft headline");
    expect(mergedProfile.currentLocation).toBe("Berlin");
  });

  it("keeps unsaved edits on an unmergeable background change and emits a reconciled save", () => {
    const onSaveAll =
      vi.fn<
        (
          profilePayload: CandidateProfile,
          preferencesPayload: JobSearchPreferences,
        ) => void
      >();
    const { rerender } = renderProfileScreen({
      initialEntry: "/job-finder/profile?section=experience",
      onSaveAll,
    });

    const companyInput = document
      .getElementById("profile-section-panel")
      ?.querySelector<HTMLInputElement>(
        'input[name="records.experiences.0.companyName"]',
      );
    expect(companyInput).toBeTruthy();
    fireEvent.change(companyInput!, { target: { value: "Kept Co" } });

    // The background removes the very record the user is editing: the merge
    // cannot be safe, so the local draft stays whole under a conflict notice.
    rerender(
      <MemoryRouter initialEntries={["/job-finder/profile?section=experience"]}>
        <ProfileScreen
          {...buildProfileScreenProps({
            onSaveAll,
            profile: {
              ...profile,
              experiences: [],
              targetRoles: ["Program Manager"],
            },
          })}
        />
      </MemoryRouter>,
    );

    const conflictNotice = screen.getByText(
      /could not be merged with your unsaved edits/,
    );
    expect(conflictNotice.closest('[role="status"]')).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Discard my edits and reload",
      }),
    ).toBeTruthy();
    expect(
      document
        .getElementById("profile-section-panel")
        ?.querySelector<HTMLInputElement>(
          'input[name="records.experiences.0.companyName"]',
        )?.value,
    ).toBe("Kept Co");

    // Saving is still the user's explicit choice; the emitted payload carries
    // the kept edit plus the newest canonical data instead of stale values.
    fireEvent.click(
      screen.getByRole<HTMLButtonElement>("button", { name: "Save changes" }),
    );

    expect(onSaveAll).toHaveBeenCalledTimes(1);
    const [emittedProfile] = onSaveAll.mock.calls[0]!;
    expect(
      emittedProfile.experiences.some(
        (experience) => experience.companyName === "Kept Co",
      ),
    ).toBe(true);
    expect(emittedProfile.targetRoles).toContain("Program Manager");

    // The returned snapshot echoes what this save emitted, so the surface
    // rebases clean and the conflict notice clears without another merge.
    rerender(
      <MemoryRouter initialEntries={["/job-finder/profile?section=experience"]}>
        <ProfileScreen
          {...buildProfileScreenProps({ onSaveAll, profile: emittedProfile })}
        />
      </MemoryRouter>,
    );

    expect(
      screen.queryByText(/could not be merged with your unsaved edits/),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Discard my edits and reload" }),
    ).toBeNull();
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Save changes" })
        .disabled,
    ).toBe(true);
  });

  it("restores the newest canonical data when the conflict reload action is used", () => {
    const onSaveAll =
      vi.fn<
        (
          profilePayload: CandidateProfile,
          preferencesPayload: JobSearchPreferences,
        ) => void
      >();
    const { rerender } = renderProfileScreen({
      initialEntry: "/job-finder/profile?section=experience",
      onSaveAll,
    });

    const companyInput = document
      .getElementById("profile-section-panel")
      ?.querySelector<HTMLInputElement>(
        'input[name="records.experiences.0.companyName"]',
      );
    expect(companyInput).toBeTruthy();
    fireEvent.change(companyInput!, { target: { value: "Kept Co" } });

    // The background removes the edited record: the merge aborts and the
    // notice exposes the discard-and-reload recovery action.
    rerender(
      <MemoryRouter initialEntries={["/job-finder/profile?section=experience"]}>
        <ProfileScreen
          {...buildProfileScreenProps({
            onSaveAll,
            profile: {
              ...profile,
              experiences: [],
              targetRoles: ["Program Manager"],
            },
          })}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/could not be merged with your unsaved edits/),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Discard my edits and reload",
      }),
    );

    // The draft is dropped in favor of the newest canonical snapshot: no
    // experience row remains, the notice and affordance disappear, and the
    // forms land clean so saving is disabled again.
    expect(
      document
        .getElementById("profile-section-panel")
        ?.querySelector<HTMLInputElement>(
          'input[name="records.experiences.0.companyName"]',
        ),
    ).toBeNull();
    expect(
      screen.queryByText(/could not be merged with your unsaved edits/),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Discard my edits and reload" }),
    ).toBeNull();
    expect(onSaveAll).not.toHaveBeenCalled();
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Save changes" })
        .disabled,
    ).toBe(true);
  });
});
