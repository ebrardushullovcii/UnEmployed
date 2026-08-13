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
import {
  JOB_SOURCES_PAGE_SIZE,
  ProfileJobSourcesTab,
} from "./profile-job-sources-tab";

type DiscoveryTarget =
  SearchPreferencesEditorValues["discoveryTargets"][number];

const scrollIntoViewMock = vi.fn();

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
    Element.prototype.scrollIntoView = scrollIntoViewMock;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
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
  });

  it("searches the complete catalog and filters enabled or attention sources", async () => {
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
      <JobSourcesHarness accessPrompts={[attentionPrompt]} />,
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
      4,
    );
    expect(screen.getByText("4 of 507 sources")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Needs attention" }));
    expect(container.querySelectorAll("[data-compact-source-id]")).toHaveLength(
      1,
    );
    expect(screen.getByText("Company 010")).toBeTruthy();
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
});
