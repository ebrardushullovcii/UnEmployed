// @vitest-environment jsdom

import { useForm } from "react-hook-form";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  JobSearchPreferencesSchema,
  type SourceAccessPrompt,
  type SourceDebugRunDetails,
} from "@unemployed/contracts";
import {
  createSearchPreferencesEditorValues,
  type SearchPreferencesEditorValues,
} from "../../lib/profile-editor";
import { buildJobSourceProgress } from "../../lib/profile-screen-view-model";
import { deriveEnabledSourceHealthCounts } from "@unemployed/job-finder/source-health";
import {
  JOB_SOURCES_PAGE_SIZE,
  ProfileJobSourcesTab,
} from "./profile-job-sources-tab";

type DiscoveryTarget =
  SearchPreferencesEditorValues["discoveryTargets"][number];

const scrollIntoViewMock = vi.fn();
let scrollIntoViewTargets: Element[] = [];

function getLastScrollIntoViewTarget(): Element | null {
  return scrollIntoViewTargets[scrollIntoViewTargets.length - 1] ?? null;
}

function createTarget(
  index: number,
  overrides: Partial<DiscoveryTarget> = {},
): DiscoveryTarget {
  return {
    id: `target_${index.toString().padStart(3, "0")}`,
    label: `Company ${index.toString().padStart(3, "0")}`,
    startingUrl: `https://jobs-${index}.example.com/openings`,
    enabled: index <= 4,
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

function createTargets(count = 507): DiscoveryTarget[] {
  return Array.from({ length: count }, (_, index) =>
    createTarget(index + 1, index === 399 ? { label: "OpenAI" } : {}),
  );
}

function JobSourcesHarness(props: {
  accessPrompts?: readonly SourceAccessPrompt[];
  targets?: DiscoveryTarget[];
}) {
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
      discoveryTargets: props.targets ?? createTargets(),
    },
  });

  return (
    <ProfileJobSourcesTab
      isBrowserSessionPending={() => false}
      isSourceDebugPending={() => false}
      isSourceInstructionPending={() => false}
      isSourceInstructionVerifyPending={() => false}
      isTargetDiscoveryPending={() => false}
      onGetSourceDebugRunDetails={() =>
        Promise.reject<SourceDebugRunDetails>(
          new Error("No debug run in this fixture."),
        )
      }
      onOpenBrowserSessionForTarget={() => undefined}
      onRunDiscoveryForTarget={() => undefined}
      onRunSourceDebug={() => undefined}
      onSaveSourceInstructionArtifact={() => undefined}
      onVerifySourceInstructions={() => undefined}
      preferencesForm={preferencesForm}
      recentSourceDebugRuns={[]}
      sourceAccessPrompts={props.accessPrompts ?? []}
      sourceInstructionArtifacts={[]}
    />
  );
}

describe("ProfileJobSourcesTab", () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = function scrollIntoViewTrackingStub(
      this: Element,
      ...args: Parameters<typeof Element.prototype.scrollIntoView>
    ) {
      scrollIntoViewTargets.push(this);
      scrollIntoViewMock.apply(this, args);
    };
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    scrollIntoViewTargets = [];
  });

  it("keeps a 507-source catalog bounded to one 25-row page", async () => {
    const targets = createTargets();
    const { container } = render(<JobSourcesHarness targets={targets} />);

    expect(buildJobSourceProgress(targets)).toEqual({
      filled: 4,
      percent: 1,
      total: 507,
    });
    expect(container.querySelectorAll("[data-compact-source-id]")).toHaveLength(
      JOB_SOURCES_PAGE_SIZE,
    );
    expect(screen.getByText("1–25 of 507")).toBeTruthy();
    expect(screen.getByText("Company 001")).toBeTruthy();
    expect(screen.queryByText("Company 026")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("26–50 of 507")).toBeTruthy();
    expect(screen.getByText("Company 026")).toBeTruthy();
    expect(screen.queryByText("Company 001")).toBeNull();
    await waitFor(() =>
      expect(scrollIntoViewMock).toHaveBeenCalledWith({
        behavior: "auto",
        block: "start",
      }),
    );
    expect(getLastScrollIntoViewTarget()).toBe(
      document.getElementById("profile-job-sources-list-heading"),
    );
  });

  it("keeps a compact top source pager reachable beside the Source library heading", async () => {
    render(<JobSourcesHarness />);

    const topPager = screen.getByRole("navigation", {
      name: "Job source pages (top of list)",
    });
    const listHeading = screen.getByText("Source library");
    expect(listHeading.closest("article")?.contains(topPager)).toBe(true);
    expect(topPager.className).toContain("flex-wrap");
    expect(
      within(topPager).getByRole("button", {
        name: "Previous source page (top of list)",
      }),
    ).toHaveProperty("disabled", true);
    expect(within(topPager).getByText("Page 1 of 21")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Next" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Previous" })).toHaveLength(1);

    const bottomPager = screen.getByRole("navigation", {
      name: "Job source pages",
    });
    expect(bottomPager).not.toBe(topPager);
    expect(bottomPager.className).toContain("flex-wrap");

    fireEvent.click(
      within(topPager).getByRole("button", {
        name: "Next source page (top of list)",
      }),
    );

    expect(screen.getByText("26–50 of 507")).toBeTruthy();
    expect(screen.getByText("Company 026")).toBeTruthy();
    expect(screen.queryByText("Company 001")).toBeNull();
    expect(
      within(topPager).getByRole("button", {
        name: "Previous source page (top of list)",
      }),
    ).toHaveProperty("disabled", false);
    await waitFor(() =>
      expect(scrollIntoViewMock).toHaveBeenCalledWith({
        behavior: "auto",
        block: "start",
      }),
    );
    expect(getLastScrollIntoViewTarget()).toBe(
      document.getElementById("profile-job-sources-list-heading"),
    );
  });

  it("keeps top pager disabled states truthful at both pagination boundaries", () => {
    render(<JobSourcesHarness targets={createTargets(30)} />);
    const topPager = screen.getByRole("navigation", {
      name: "Job source pages (top of list)",
    });
    const topPrevious = () =>
      within(topPager).getByRole("button", {
        name: "Previous source page (top of list)",
      });
    const topNext = () =>
      within(topPager).getByRole("button", {
        name: "Next source page (top of list)",
      });

    expect(topPrevious()).toHaveProperty("disabled", true);
    expect(topNext()).toHaveProperty("disabled", false);

    fireEvent.click(topNext());

    expect(screen.getByText("26–30 of 30")).toBeTruthy();
    expect(screen.queryByText("Company 001")).toBeNull();
    expect(topNext()).toHaveProperty("disabled", true);
    expect(topPrevious()).toHaveProperty("disabled", false);
    expect(getLastScrollIntoViewTarget()).toBe(
      document.getElementById("profile-job-sources-list-heading"),
    );
    const writeCountAfterNext = scrollIntoViewTargets.length;

    fireEvent.click(topPrevious());

    expect(screen.getByText("1–25 of 30")).toBeTruthy();
    expect(topPrevious()).toHaveProperty("disabled", true);
    expect(topNext()).toHaveProperty("disabled", false);
    expect(scrollIntoViewTargets.length).toBe(writeCountAfterNext + 1);
    expect(getLastScrollIntoViewTarget()).toBe(
      document.getElementById("profile-job-sources-list-heading"),
    );
  });

  it("omits both pagers when every source fits one page", () => {
    render(<JobSourcesHarness targets={createTargets(3)} />);

    expect(
      screen.queryByRole("navigation", {
        name: "Job source pages (top of list)",
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("navigation", { name: "Job source pages" }),
    ).toBeNull();
    expect(screen.getByText("3 sources")).toBeTruthy();
  });

  it("searches the complete catalog and filters enabled or attention sources", async () => {
    const targets = createTargets();
    // Attention is scoped to enabled sources, so the prompted source must be
    // enabled to appear under the Needs attention view.
    const promptedIndex = targets.findIndex(
      (target) => target.id === "target_010",
    );
    targets[promptedIndex] = { ...targets[promptedIndex]!, enabled: true };
    const attentionPrompt: SourceAccessPrompt = {
      targetId: "target_010",
      targetLabel: "Company 010",
      targetUrl: "https://jobs-10.example.com/openings",
      state: "prompt_login_required",
      summary: "Sign in before retrying.",
      detail: null,
      actionLabel: "Open sign-in",
      rerunLabel: null,
      updatedAt: "2026-08-11T10:00:00.000Z",
    };
    const { container } = render(
      <JobSourcesHarness accessPrompts={[attentionPrompt]} targets={targets} />,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Find a source" }), {
      target: { value: "openai" },
    });

    await waitFor(() => expect(screen.getByText("OpenAI")).toBeTruthy());
    expect(screen.getByText("1 of 507 sources")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Enabled" }));
    await waitFor(() =>
      expect(
        container.querySelectorAll("[data-compact-source-id]"),
      ).toHaveLength(0),
    );

    fireEvent.click(screen.getByRole("button", { name: "Show all sources" }));
    fireEvent.click(screen.getByRole("button", { name: "Enabled" }));
    expect(container.querySelectorAll("[data-compact-source-id]")).toHaveLength(
      5,
    );
    expect(screen.getByText("5 of 507 sources")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Needs attention" }));
    // Every enabled source that has never been verified needs attention, so
    // Companies 001–004 plus the prompted Company 010 appear here.
    expect(container.querySelectorAll("[data-compact-source-id]")).toHaveLength(
      5,
    );
    expect(screen.getByText("Company 010")).toBeTruthy();
  });

  it("reports the same attention counts and labels as the Home projection across source states", () => {
    const verifiedAt = "2026-08-20T09:00:00.000Z";
    const targets: DiscoveryTarget[] = [
      createTarget(1, {
        id: "target_healthy",
        label: "Healthy source",
        instructionStatus: "validated",
        lastVerifiedAt: verifiedAt,
      }),
      // First-run default: enabled but never checked.
      createTarget(2, { id: "target_never_run", label: "Never run source" }),
      createTarget(3, {
        id: "target_failing",
        label: "Failing source",
        instructionStatus: "validated",
        lastVerifiedAt: verifiedAt,
        staleReason: "Starting page URL changed.",
      }),
      createTarget(4, {
        id: "target_unsupported",
        label: "Unsupported source",
        instructionStatus: "unsupported",
        lastVerifiedAt: verifiedAt,
      }),
      createTarget(5, {
        id: "target_login",
        label: "Login locked source",
        enabled: true,
        instructionStatus: "validated",
        lastVerifiedAt: verifiedAt,
      }),
      // Disabled sources must not inflate active health.
      createTarget(6, {
        id: "target_disabled_never_run",
        label: "Disabled never run",
        enabled: false,
      }),
      createTarget(7, {
        id: "target_disabled_failing",
        label: "Disabled failing",
        enabled: false,
        instructionStatus: "validated",
        lastVerifiedAt: verifiedAt,
        staleReason: "Verification failed.",
      }),
    ];
    const loginPrompt: SourceAccessPrompt = {
      targetId: "target_login",
      targetLabel: "Login locked source",
      targetUrl: "https://jobs-5.example.com/openings",
      state: "prompt_login_required",
      summary: "Sign in before retrying.",
      detail: null,
      actionLabel: "Open sign-in",
      rerunLabel: null,
      updatedAt: "2026-08-20T09:30:00.000Z",
    };
    const { container } = render(
      <JobSourcesHarness accessPrompts={[loginPrompt]} targets={targets} />,
    );

    // The Home dashboard derives identical numbers from the same workspace
    // state through the shared `@unemployed/job-finder/source-health`
    // classifier; assert the rendered cards agree with it exactly.
    const expectedCounts = deriveEnabledSourceHealthCounts(targets, {
      runningTargetIds: new Set<string>(),
      loginRequiredTargetIds: new Set(["target_login"]),
    });
    expect(expectedCounts).toEqual({
      healthy: 1,
      needsAttention: 4,
      running: 0,
      total: 5,
    });

    const summaryList = screen.getByRole("list", {
      name: "Job source summary",
    });
    function summaryCardValue(label: string): string {
      const item = within(summaryList)
        .getAllByRole("listitem")
        .find((node) => node.textContent?.includes(label));
      expect(item).toBeTruthy();
      return (item as HTMLElement).querySelector("strong")?.textContent ?? "";
    }

    expect(summaryCardValue("Total sources")).toBe(String(targets.length));
    expect(summaryCardValue("Enabled for search")).toBe(
      String(expectedCounts.total),
    );
    expect(summaryCardValue("Disabled")).toBe("2");
    expect(summaryCardValue("Needs attention")).toBe(
      String(expectedCounts.needsAttention),
    );

    fireEvent.click(screen.getByRole("button", { name: "Needs attention" }));

    const visibleRows = Array.from(
      container.querySelectorAll("[data-compact-source-id]"),
    ).map((node) => node.getAttribute("data-compact-source-id"));
    expect(visibleRows).toEqual([
      "target_never_run",
      "target_failing",
      "target_unsupported",
      "target_login",
    ]);

    for (const rowId of visibleRows) {
      const row = container.querySelector(
        `[data-compact-source-id="${rowId}"]`,
      ) as HTMLElement;
      expect(within(row).getByText("Needs attention")).toBeTruthy();
    }

    // Back on the full library view, disabled problem sources stay explicitly
    // labeled as disabled without an attention badge.
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    for (const disabledRowId of [
      "target_disabled_never_run",
      "target_disabled_failing",
    ]) {
      const row = container.querySelector(
        `[data-compact-source-id="${disabledRowId}"]`,
      ) as HTMLElement;
      expect(within(row).queryByText("Needs attention")).toBeNull();
      expect(within(row).getByText("Disabled")).toBeTruthy();
    }
  });

  it("names the unmatched query in the empty state and restores the full list", async () => {
    const { container } = render(
      <JobSourcesHarness targets={createTargets(3)} />,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "Find a source" }), {
      target: { value: "nonexistent" },
    });

    await waitFor(() =>
      expect(screen.getByText('No sources match "nonexistent"')).toBeTruthy(),
    );
    expect(
      screen.getAllByRole("status").map((node) => node.textContent),
    ).toContain('No sources match "nonexistent"');

    fireEvent.click(screen.getByRole("button", { name: "Show all sources" }));

    expect(screen.queryByText('No sources match "nonexistent"')).toBeNull();
    expect(container.querySelectorAll("[data-compact-source-id]")).toHaveLength(
      3,
    );
    expect(screen.getByText("3 sources")).toBeTruthy();
  });

  it("supports quick enablement and mounts the full editor only for the opened source", () => {
    const { container } = render(
      <JobSourcesHarness targets={createTargets(30)} />,
    );
    const companyFive = screen.getByText("Company 005").closest("article");

    expect(companyFive).toBeTruthy();
    fireEvent.click(
      within(companyFive as HTMLElement).getByRole("checkbox", {
        name: "Include Company 005 in searches",
      }),
    );
    expect(
      within(companyFive as HTMLElement).getByText("Enabled"),
    ).toBeTruthy();
    expect(
      within(
        screen.getByText("Enabled for search").parentElement as HTMLElement,
      ).getByText("5"),
    ).toBeTruthy();

    fireEvent.click(
      within(companyFive as HTMLElement).getByRole("button", {
        name: "Edit Company 005",
      }),
    );

    expect(
      container.querySelectorAll("[data-expanded-source-id]"),
    ).toHaveLength(1);
    expect(container.querySelectorAll("[data-compact-source-id]")).toHaveLength(
      JOB_SOURCES_PAGE_SIZE - 1,
    );
    expect(screen.getByDisplayValue("Company 005")).toBeTruthy();
    expect(
      screen.getByDisplayValue("https://jobs-5.example.com/openings"),
    ).toBeTruthy();
  });

  it("keeps a newly added source disabled until it is explicitly enabled", () => {
    render(<JobSourcesHarness targets={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Add source" }));

    expect(
      screen
        .getByRole("checkbox", {
          name: "Include this source in searches",
        })
        .getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      screen.getByText("Enabled for search").parentElement?.textContent,
    ).toContain("0");
  });

  it("truncates long source names in rows while exposing the complete name", () => {
    const longName = "SourceNameWithoutAnyWordBreaksAtAll";
    const { container } = render(
      <JobSourcesHarness targets={[createTarget(1, { label: longName })]} />,
    );

    const title = container.querySelector("h4");
    expect(title?.textContent).toBe(longName);
    expect(title?.className).toContain("min-w-0");
    expect(title?.className).toContain("max-w-full");
    expect(title?.className).toContain("truncate");
    expect(title?.getAttribute("title")).toBe(longName);
  });
});
