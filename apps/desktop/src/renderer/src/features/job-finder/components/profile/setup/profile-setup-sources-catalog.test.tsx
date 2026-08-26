// @vitest-environment jsdom

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useForm } from "react-hook-form";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  CandidateProfileSchema,
  createStarterJobDiscoveryTargets,
  evaluateProfileSetupReadiness,
  JobSearchPreferencesSchema,
  type JobSearchPreferences,
} from "@unemployed/contracts";
import {
  buildSearchPreferencesPayload,
  createProfileEditorValues,
  createSearchPreferencesEditorValues,
  type ProfileEditorValues,
  type SearchPreferencesEditorValues,
} from "../../../lib/profile-editor";
import type { DiscoveryTargetEditorValue } from "../../../lib/job-finder-types";
import { ProfileSetupTargetingStep } from "./profile-setup-step-sections";

const profile = CandidateProfileSchema.parse({
  id: "candidate_setup_sources_catalog",
  firstName: "Alex",
  lastName: "Vanguard",
  fullName: "Alex Vanguard",
  headline: "Platform engineer",
  summary: "Builds dependable systems.",
  currentLocation: "Prishtina, Kosovo",
  yearsExperience: 7,
  email: "alex@example.com",
  baseResume: {
    id: "resume_setup_sources_catalog",
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

const baselinePreferences = JobSearchPreferencesSchema.parse({
  targetRoles: [],
  minimumSalaryUsd: null,
  approvalMode: "review_before_submit",
  tailoringMode: "balanced",
  discovery: { targets: [] },
});

// True first-run shape: exactly what createEmptyJobFinderRepositoryState()
// seeds through contracts, so tests exercise the real fresh seed.
const freshSeedPreferences = JobSearchPreferencesSchema.parse({
  targetRoles: [],
  minimumSalaryUsd: null,
  approvalMode: "review_before_submit",
  tailoringMode: "balanced",
  discovery: {
    historyLimit: 5,
    targets: createStarterJobDiscoveryTargets(),
  },
});
const freshSeedEditorTargets =
  createSearchPreferencesEditorValues(freshSeedPreferences).discoveryTargets;

function createCatalogTarget(
  index: number,
  overrides: Partial<DiscoveryTargetEditorValue> = {},
): DiscoveryTargetEditorValue {
  const sourceNumber = index.toString().padStart(3, "0");

  return {
    id: `catalog_target_${sourceNumber}`,
    label: `Board ${sourceNumber}`,
    startingUrl: `https://jobs-${index}.example.com/openings`,
    enabled: false,
    adapterKind: "auto",
    customInstructions: "",
    instructionStatus: "missing",
    validatedInstructionId: null,
    draftInstructionId: null,
    lastDebugRunId: null,
    lastVerifiedAt: null,
    staleReason: null,
    ...overrides,
  };
}

function createCatalogTargets(count = 40): DiscoveryTargetEditorValue[] {
  return Array.from({ length: count }, (_, index) =>
    createCatalogTarget(index + 1, {
      ...(index === 16 ? { label: "Mercury Greenhouse board" } : {}),
    }),
  );
}

function assertIsHTMLElement(
  value: Element | null,
  message: string,
): HTMLElement {
  if (!(value instanceof HTMLElement)) {
    throw new Error(message);
  }
  return value;
}

function assertDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}

function SetupCatalogHarness(props: {
  baselinePreferences?: JobSearchPreferences;
  targets?: DiscoveryTargetEditorValue[];
}) {
  const baseline = props.baselinePreferences ?? baselinePreferences;
  const profileForm = useForm<ProfileEditorValues>({
    defaultValues: createProfileEditorValues(profile),
  });
  const preferencesForm = useForm<SearchPreferencesEditorValues>({
    defaultValues: {
      ...createSearchPreferencesEditorValues(baseline),
      discoveryTargets: props.targets ?? createCatalogTargets(),
    },
  });
  const watchedDiscoveryTargets = preferencesForm.watch("discoveryTargets");
  // Same save path the step footer uses: readiness must move only when the
  // shared payload builder accepts the current draft.
  const savedPreferencesResult = buildSearchPreferencesPayload(baseline, {
    ...createSearchPreferencesEditorValues(baseline),
    discoveryTargets: watchedDiscoveryTargets,
  });
  const discoveryReady = savedPreferencesResult.payload
    ? evaluateProfileSetupReadiness(profile, savedPreferencesResult.payload)
        .hasDiscoverySource
    : false;

  return (
    <>
      <ProfileSetupTargetingStep
        nextStep="narrative"
        onSaveAndGoToStep={() => undefined}
        preferencesForm={preferencesForm}
        profileForm={profileForm}
        renderFooter={() => null}
      />
      <output data-discovery-source-ready={String(discoveryReady)}>
        {discoveryReady ? "discovery ready" : "discovery blocked"}
      </output>
    </>
  );
}

function getDiscoveryReady(): boolean {
  const output = document.querySelector("output");

  return output?.getAttribute("data-discovery-source-ready") === "true";
}

describe("ProfileSetupTargetingStep guided source catalog", () => {
  beforeAll(() => {
    // Deterministic pagination: the component's rAF-driven focus jump runs
    // synchronously instead of depending on jsdom frame timing.
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("presents seeded starter sources on a true fresh workspace and enables one explicitly", () => {
    render(
      <SetupCatalogHarness
        baselinePreferences={freshSeedPreferences}
        targets={freshSeedEditorTargets}
      />,
    );

    expect(screen.getByText("3 sources")).toBeTruthy();
    expect(screen.getByText("0 of 3 sources enabled for search")).toBeTruthy();
    // Starter sources exist but are all disabled: warn before the ready
    // check instead of staying silent until discovery fails.
    expect(
      screen.getByText(
        "All 3 saved sources are turned off. Enable at least one source below so Job Finder has somewhere to search.",
      ),
    ).toBeTruthy();

    const kosovaRowCandidate = screen.getByText("KosovaJob").closest("article");
    expect(kosovaRowCandidate).toBeTruthy();
    const kosovaRow = assertIsHTMLElement(
      kosovaRowCandidate,
      "Expected KosovaJob row to be an HTMLElement",
    );
    expect(
      within(kosovaRow).getByText(
        "Public regional job board that is usually readable without an account.",
      ),
    ).toBeTruthy();
    expect(within(kosovaRow).getByText("Disabled")).toBeTruthy();
    expect(screen.getByText(/usually requires signing in/i)).toBeTruthy();
    expect(getDiscoveryReady()).toBe(false);

    fireEvent.click(
      within(kosovaRow).getByRole("button", {
        name: "Enable KosovaJob in searches",
      }),
    );

    expect(within(kosovaRow).getByText("Enabled")).toBeTruthy();
    expect(screen.getByText("1 of 3 sources enabled for search")).toBeTruthy();
    expect(
      screen.queryByText(/Enable at least one source below/),
    ).toBeNull();
    expect(
      screen.getByText("Wellfound").closest("article")?.textContent,
    ).toContain("Disabled");
    expect(
      screen.getByText("LinkedIn Jobs").closest("article")?.textContent,
    ).toContain("Disabled");
    expect(getDiscoveryReady()).toBe(true);
  });

  it("scrolls the source list with responsive header margins before claiming focus on page change", () => {
    render(<SetupCatalogHarness />);

    const rawListHeading = document.getElementById(
      "profile-setup-job-sources-list-heading",
    );
    expect(rawListHeading).not.toBeNull();
    const listHeading = assertIsHTMLElement(
      rawListHeading,
      "Expected profile-setup-job-sources-list-heading to be an HTMLElement",
    );

    // Own synchronous frame mock: the suite-wide beforeAll spy is restored
    // by afterEach, so later tests must not rely on it.
    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });

    const scrollSpy = vi.fn();
    listHeading.scrollIntoView = scrollSpy;
    const focusSpy = vi.fn();
    listHeading.focus = focusSpy;

    // 40 catalog targets at a 25-row page size yield two pages.
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    rafSpy.mockRestore();

    // The reveal scrolls first through the shared responsive margins, then
    // claims focus without letting the browser perform any jump of its own.
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
    });
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    const scrollOrder = assertDefined(
      scrollSpy.mock.invocationCallOrder[0],
      "Expected scrollSpy invocationCallOrder[0] to be defined",
    );
    const focusOrder = assertDefined(
      focusSpy.mock.invocationCallOrder[0],
      "Expected focusSpy invocationCallOrder[0] to be defined",
    );
    expect(scrollOrder).toBeLessThan(focusOrder);
    expect(listHeading.className).toContain("scroll-mt-4");
    expect(listHeading.className).toContain("sm:scroll-mt-[8.25rem]");
    expect(listHeading.className).toContain("min-[1440px]:scroll-mt-[4.5rem]");
  });

  it("finds a known catalog entry by search and enables exactly that source explicitly", async () => {
    const { container } = render(<SetupCatalogHarness />);

    expect(getDiscoveryReady()).toBe(false);
    expect(screen.getByText("0 of 40 sources enabled for search")).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "Find a source" }), {
      target: { value: "mercury" },
    });
    await waitFor(() =>
      expect(screen.getByText("1 of 40 sources")).toBeTruthy(),
    );

    const mercuryRowCandidate = screen
      .getByText("Mercury Greenhouse board")
      .closest("article");
    expect(mercuryRowCandidate).toBeTruthy();
    const mercuryRow = assertIsHTMLElement(
      mercuryRowCandidate,
      "Expected Mercury Greenhouse board row to be an HTMLElement",
    );
    expect(within(mercuryRow).getByText("Disabled")).toBeTruthy();

    fireEvent.click(
      within(mercuryRow).getByRole("button", {
        name: "Enable Mercury Greenhouse board in searches",
      }),
    );

    expect(within(mercuryRow).getByText("Enabled")).toBeTruthy();
    expect(
      within(mercuryRow).getByRole("button", {
        name: "Disable Mercury Greenhouse board in searches",
      }),
    ).toBeTruthy();
    expect(screen.getByText("1 of 40 sources enabled for search")).toBeTruthy();
    expect(getDiscoveryReady()).toBe(true);
    expect(container.textContent).not.toContain("Board 010 Enabled");
  });

  it("keeps every catalog entry disabled through search, paging, and editing", async () => {
    const { container } = render(
      <SetupCatalogHarness targets={createCatalogTargets(30)} />,
    );
    const enabledStatus = () => screen.getByText(/sources enabled for search/);

    expect(enabledStatus().textContent).toBe(
      "0 of 30 sources enabled for search",
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Find a source" }), {
      target: { value: "board" },
    });
    expect(await screen.findByText("30 sources")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(enabledStatus().textContent).toBe(
        "0 of 30 sources enabled for search",
      ),
    );
    for (const card of Array.from(
      container.querySelectorAll("[data-profile-setup-source-card]"),
    )) {
      expect(card.textContent).toContain("Disabled");
    }

    fireEvent.click(screen.getByRole("button", { name: "Edit Board 026" }));
    expect(
      container.querySelector("#profile-setup-source-url-catalog_target_026"),
    ).toBeTruthy();
    expect(enabledStatus().textContent).toBe(
      "0 of 30 sources enabled for search",
    );
    expect(getDiscoveryReady()).toBe(false);
  });

  it("adds a manual URL fallback that stays off until explicitly enabled", async () => {
    render(<SetupCatalogHarness targets={[]} />);

    expect(
      screen.getByText(
        "No job source is configured yet. Add the public page where you would normally browse open roles.",
      ),
    ).toBeTruthy();
    expect(
      document.querySelector("[data-profile-setup-manual-source-form]"),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Add a source URL manually" }),
    );

    const addButton = screen.getByRole("button", { name: "Add source" });
    expect(addButton.hasAttribute("disabled")).toBe(true);

    const urlInput = screen.getByLabelText("Careers or job-board URL");
    fireEvent.change(urlInput, {
      target: { value: "example.com/careers" },
    });
    expect(
      await screen.findByText(
        "Enter a complete http or https URL before this source can be used.",
      ),
    ).toBeTruthy();
    expect(urlInput.getAttribute("aria-invalid")).toBe("true");
    expect(addButton.hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText("Source name"), {
      target: { value: "Acme careers" },
    });
    fireEvent.change(urlInput, {
      target: { value: "https://acme.example/careers" },
    });
    expect(addButton.hasAttribute("disabled")).toBe(false);

    fireEvent.click(addButton);

    const acmeRowCandidate = screen.getByText("Acme careers").closest("article");
    expect(acmeRowCandidate).toBeTruthy();
    const acmeRow = assertIsHTMLElement(
      acmeRowCandidate,
      "Expected Acme careers row to be an HTMLElement",
    );
    expect(within(acmeRow).getByText("Disabled")).toBeTruthy();
    expect(getDiscoveryReady()).toBe(false);

    fireEvent.click(
      within(acmeRow).getByRole("button", {
        name: "Enable Acme careers in searches",
      }),
    );

    expect(within(acmeRow).getByText("Enabled")).toBeTruthy();
    expect(getDiscoveryReady()).toBe(true);
  });

  it("explains unsupported guidance and blocks enabling sources without valid URLs", () => {
    render(
      <SetupCatalogHarness
        targets={[
          createCatalogTarget(1, {
            id: "catalog_target_unsupported",
            label: "Unsupported board",
            instructionStatus: "unsupported",
          }),
          createCatalogTarget(2, {
            id: "catalog_target_broken",
            label: "Broken board",
            startingUrl: "not-a-url",
          }),
        ]}
      />,
    );

    expect(screen.getByText("Unsupported for checks")).toBeTruthy();
    expect(
      screen.getByText(
        "Automated checks could not read this site reliably yet.",
      ),
    ).toBeTruthy();

    expect(
      screen
        .getByRole("button", {
          name: "Enable Unsupported board in searches",
        })
        .hasAttribute("disabled"),
    ).toBe(false);

    expect(
      screen
        .getByRole("button", { name: "Enable Broken board in searches" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByText(
        "This source needs a complete http or https URL. Choose Edit to fix it before enabling it.",
      ),
    ).toBeTruthy();
  });
});
