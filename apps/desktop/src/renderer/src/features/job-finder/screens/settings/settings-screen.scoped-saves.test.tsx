// @vitest-environment jsdom

import { act } from "react";
import type {
  AppearanceTheme,
  ApplicationCrmSettings,
  BrowserSessionState,
  JobFinderSettings,
  UpdateApplicationDefaultsInput,
  UpdateWorkspaceBehaviorInput,
} from "@unemployed/contracts";
import {
  ApplicationCrmSettingsSchema,
  JobFinderSettingsSchema,
} from "@unemployed/contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SettingsScreen } from "./settings-screen";

const globalActScope = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

beforeAll(() => {
  globalActScope.IS_REACT_ACT_ENVIRONMENT = true;
});

const browserSession = {
  source: "target_site",
  status: "idle",
  driver: "catalog_seed",
  label: "Idle",
  detail: null,
  lastCheckedAt: "2026-08-01T00:00:00.000Z",
} as unknown as BrowserSessionState;

function parseSettings(
  overrides: Partial<JobFinderSettings> = {},
): JobFinderSettings {
  return JobFinderSettingsSchema.parse({
    allowAutoSubmitOverride: false,
    fontPreset: "inter_requisite",
    humanReviewRequired: true,
    keepSessionAlive: false,
    resumeFormat: "pdf",
    resumeTemplateId: "classic_ats",
    ...overrides,
  });
}

function createCallbacks() {
  return {
    onResetWorkspace: vi.fn(),
    onSettingsDraftEdited: vi.fn(),
    // Production scoped saves resolve false when a save did not commit.
    onUpdateAppearanceTheme: vi.fn<
      (theme: AppearanceTheme) => Promise<boolean>
    >(() => Promise.resolve(true)),
    onUpdateApplicationDefaults: vi.fn<
      (input: UpdateApplicationDefaultsInput) => Promise<boolean>
    >(() => Promise.resolve(true)),
    onUpdateTrackerCrm: vi.fn<
      (crm: ApplicationCrmSettings) => Promise<boolean>
    >(() => Promise.resolve(true)),
    onUpdateWorkspaceBehavior: vi.fn<
      (input: UpdateWorkspaceBehaviorInput) => Promise<boolean>
    >(() => Promise.resolve(true)),
  };
}

type Callbacks = ReturnType<typeof createCallbacks>;

function renderScreen(settings: JobFinderSettings, callbacks: Callbacks) {
  const renderWithSettings = (currentSettings: JobFinderSettings) => (
    <MemoryRouter>
      <SettingsScreen
        availableResumeTemplates={[]}
        browserSession={browserSession}
        isWorkspaceResetPending={false}
        onResetWorkspace={callbacks.onResetWorkspace}
        onSettingsDraftEdited={callbacks.onSettingsDraftEdited}
        onUpdateAppearanceTheme={(theme) =>
          callbacks.onUpdateAppearanceTheme(theme)
        }
        onUpdateApplicationDefaults={(input) =>
          callbacks.onUpdateApplicationDefaults(input)
        }
        onUpdateTrackerCrm={(crm) => callbacks.onUpdateTrackerCrm(crm)}
        onUpdateWorkspaceBehavior={(input) =>
          callbacks.onUpdateWorkspaceBehavior(input)
        }
        settings={currentSettings}
      />
    </MemoryRouter>
  );
  const view = render(renderWithSettings(settings));

  return {
    rerender(nextSettings: JobFinderSettings) {
      view.rerender(renderWithSettings(nextSettings));
    },
    unmount() {
      view.unmount();
    },
  };
}

describe("SettingsScreen scoped section saves", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("sends only owned fields per scoped save and keeps other sections untouched", async () => {
    const callbacks = createCallbacks();
    const view = renderScreen(parseSettings(), callbacks);

    const appDevice = screen.getByRole("region", { name: "App & device" });
    const appearanceSave = within(appDevice).getByRole<HTMLButtonElement>(
      "button",
      {
        name: "Save appearance",
      },
    );
    expect(appearanceSave.disabled).toBe(true);
    fireEvent.click(within(appDevice).getByRole("radio", { name: "Dark" }));
    expect(appearanceSave.disabled).toBe(false);
    fireEvent.click(appearanceSave);

    await waitFor(() =>
      expect(callbacks.onUpdateAppearanceTheme).toHaveBeenCalledWith("dark"),
    );
    expect(callbacks.onUpdateApplicationDefaults).not.toHaveBeenCalled();
    expect(callbacks.onUpdateWorkspaceBehavior).not.toHaveBeenCalled();

    const workspace = screen.getByRole("region", {
      name: "Workspace behavior",
    });
    const defaults = screen.getByRole("region", {
      name: "Application defaults",
    });

    expect(
      within(defaults).getByRole<HTMLButtonElement>("button", {
        name: "Save resume preference",
      }).disabled,
    ).toBe(true);

    const keepBrowserSwitch = within(workspace).getAllByRole("switch")[0]!;
    fireEvent.click(keepBrowserSwitch);
    expect(keepBrowserSwitch.getAttribute("aria-checked")).toBe("true");

    const workspaceSave = within(workspace).getByRole<HTMLButtonElement>(
      "button",
      {
        name: "Save workspace behavior",
      },
    );
    expect(workspaceSave.disabled).toBe(false);
    fireEvent.click(workspaceSave);

    await waitFor(() =>
      expect(callbacks.onUpdateWorkspaceBehavior).toHaveBeenCalledWith({
        discoveryOnly: false,
        keepSessionAlive: true,
      }),
    );
    // The application defaults save was never triggered by the workspace save.
    expect(callbacks.onUpdateApplicationDefaults).not.toHaveBeenCalled();

    view.unmount();
  });

  it("keeps staged resume choices across an external settings refresh and sends only defaults-owned fields", async () => {
    const callbacks = createCallbacks();
    const initialSettings = parseSettings();
    const view = renderScreen(initialSettings, callbacks);

    const defaultsRegion = screen.getByRole("region", {
      name: "Application defaults",
    });
    const originalCvChoice = within(defaultsRegion).getByRole("radio", {
      name: /Use my original resume unchanged/,
    });
    fireEvent.click(originalCvChoice);
    expect(originalCvChoice.getAttribute("aria-checked")).toBe("true");

    // External refresh: persisted workspace behavior changed elsewhere.
    view.rerender(parseSettings({ keepSessionAlive: true }));

    const refreshedDefaultsRegion = screen.getByRole("region", {
      name: "Application defaults",
    });
    const stillStagedChoice = within(refreshedDefaultsRegion).getByRole(
      "radio",
      { name: /Use my original resume unchanged/ },
    );
    // The staged resume choice survived the external settings prop refresh.
    expect(stillStagedChoice.getAttribute("aria-checked")).toBe("true");

    const refreshedWorkspaceRegion = screen.getByRole("region", {
      name: "Workspace behavior",
    });
    expect(
      within(refreshedWorkspaceRegion)
        .getAllByRole("switch")[0]
        ?.getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      within(refreshedWorkspaceRegion).getByRole<HTMLButtonElement>("button", {
        name: "Save workspace behavior",
      }).disabled,
    ).toBe(true);

    const defaultsSave = within(
      refreshedDefaultsRegion,
    ).getByRole<HTMLButtonElement>("button", {
      name: "Save resume preference",
    });
    expect(defaultsSave.disabled).toBe(false);
    fireEvent.click(defaultsSave);

    await waitFor(() =>
      expect(callbacks.onUpdateApplicationDefaults).toHaveBeenCalledTimes(1),
    );
    expect(callbacks.onUpdateApplicationDefaults).toHaveBeenCalledWith({
      fontPreset: "inter_requisite",
      resumeApplicationMode: "original_resume",
      resumeTemplateId: "classic_ats",
    } satisfies UpdateApplicationDefaultsInput);
    // No whole JobFinderSettings payload and no workspace fields leaked.
    const payload = callbacks.onUpdateApplicationDefaults.mock
      .calls[0]?.[0] as UpdateApplicationDefaultsInput;
    expect(Object.keys(payload).sort()).toEqual([
      "fontPreset",
      "resumeApplicationMode",
      "resumeTemplateId",
    ]);
    expect(callbacks.onUpdateWorkspaceBehavior).not.toHaveBeenCalled();

    view.unmount();
  });

  it("reports saved then failed save truth for a scoped section without touching others", async () => {
    let rejectDefaults: ((error: unknown) => void) | null = null;
    const callbacks = createCallbacks();
    callbacks.onUpdateApplicationDefaults.mockImplementationOnce(
      () =>
        new Promise<boolean>((_resolve, reject) => {
          rejectDefaults = reject;
        }),
    );
    const view = renderScreen(
      parseSettings({ resumeApplicationMode: "tailored_per_job" }),
      callbacks,
    );

    const defaultsRegion = screen.getByRole("region", {
      name: "Application defaults",
    });
    fireEvent.click(
      within(defaultsRegion).getByRole("radio", {
        name: /Use my original resume unchanged/,
      }),
    );

    const pendingSave = within(defaultsRegion).getByRole<HTMLButtonElement>(
      "button",
      {
        name: "Save resume preference",
      },
    );
    fireEvent.click(pendingSave);
    expect(
      within(defaultsRegion).queryByRole("button", {
        name: "Retry resume preference",
      }),
    ).toBeNull();

    await act(() => {
      rejectDefaults?.(new Error("save rejected"));
      return Promise.resolve();
    });

    const retrySave = within(defaultsRegion).getByRole<HTMLButtonElement>(
      "button",
      {
        name: "Retry resume preference",
      },
    );
    expect(retrySave.disabled).toBe(false);
    expect(
      within(defaultsRegion).getByText(
        "Resume preference was not saved. Retry before leaving this page.",
      ),
    ).toBeTruthy();

    fireEvent.click(retrySave);
    await waitFor(() =>
      expect(callbacks.onUpdateApplicationDefaults).toHaveBeenCalledTimes(2),
    );

    view.unmount();
  });

  it("wires the tracker editor to the scoped CRM callback only", async () => {
    const callbacks = createCallbacks();
    const crmSettings = ApplicationCrmSettingsSchema.parse({});
    const view = renderScreen(
      parseSettings({ applicationCrm: crmSettings }),
      callbacks,
    );

    const tracker = screen.getByRole("region", { name: "Tracker" });
    const afterDaysInput = within(tracker).getByLabelText("After days");
    fireEvent.change(afterDaysInput, { target: { value: "7" } });

    fireEvent.click(
      within(tracker).getByRole<HTMLButtonElement>("button", {
        name: "Save tracker settings",
      }),
    );

    await waitFor(() =>
      expect(callbacks.onUpdateTrackerCrm).toHaveBeenCalledTimes(1),
    );
    expect(callbacks.onUpdateTrackerCrm).toHaveBeenCalledWith(
      expect.objectContaining({
        noResponseAutomation: { afterDays: 7, enabled: true },
      }),
    );
    expect(callbacks.onUpdateApplicationDefaults).not.toHaveBeenCalled();
    expect(callbacks.onUpdateWorkspaceBehavior).not.toHaveBeenCalled();

    view.unmount();
  });

  it("keeps appearance pending until its scoped save settles and reports a resolved false as failed", async () => {
    let resolveAppearance: ((saved: boolean) => void) | null = null;
    const callbacks = createCallbacks();
    callbacks.onUpdateAppearanceTheme.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveAppearance = resolve;
        }),
    );
    const view = renderScreen(parseSettings(), callbacks);

    const appDevice = screen.getByRole("region", { name: "App & device" });
    fireEvent.click(within(appDevice).getByRole("radio", { name: "Dark" }));
    fireEvent.click(
      within(appDevice).getByRole<HTMLButtonElement>("button", {
        name: "Save appearance",
      }),
    );

    // The pending state must last for the IPC promise, not end early.
    expect(
      within(appDevice).getByRole<HTMLButtonElement>("button", {
        name: "Saving appearance",
      }).hasAttribute("disabled"),
    ).toBe(false);
    expect(
      within(appDevice)
        .getByRole<HTMLButtonElement>("button", { name: "Saving appearance" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
    expect(
      within(appDevice)
        .getByRole("status")
        .getAttribute("data-settings-save-state"),
    ).toBe("saving");

    await act(() => {
      resolveAppearance?.(false);
      return Promise.resolve();
    });

    expect(
      within(appDevice).getByText(
        "Appearance was not saved. Retry before leaving this page.",
      ),
    ).toBeTruthy();
    expect(
      within(appDevice)
        .getByRole("status")
        .getAttribute("data-settings-save-state"),
    ).toBe("failed");
    // A failed save keeps the staged choice dirty and retryable.
    expect(
      within(appDevice)
        .getByRole("radio", { name: "Dark" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      within(appDevice).getByRole<HTMLButtonElement>("button", {
        name: "Retry appearance",
      }).disabled,
    ).toBe(false);

    view.unmount();
  });

  it("reports a resolved false resume-preference save as failed instead of saved", async () => {
    const callbacks = createCallbacks();
    callbacks.onUpdateApplicationDefaults.mockResolvedValueOnce(false);
    const view = renderScreen(parseSettings(), callbacks);

    const defaultsRegion = screen.getByRole("region", {
      name: "Application defaults",
    });
    fireEvent.click(
      within(defaultsRegion).getByRole("radio", {
        name: /Use my original resume unchanged/,
      }),
    );
    fireEvent.click(
      within(defaultsRegion).getByRole<HTMLButtonElement>("button", {
        name: "Save resume preference",
      }),
    );

    await waitFor(() =>
      expect(
        within(defaultsRegion).queryByRole("button", {
          name: "Retry resume preference",
        }),
      ).not.toBeNull(),
    );
    expect(
      within(defaultsRegion).getByText(
        "Resume preference was not saved. Retry before leaving this page.",
      ),
    ).toBeTruthy();
    // No local saved message may appear for a resolved false.
    expect(
      within(defaultsRegion).queryByText(
        "Resume preference saved for newly shortlisted jobs.",
      ),
    ).toBeNull();
    // The staged choice survives the failed save.
    expect(
      within(defaultsRegion)
        .getByRole("radio", { name: /Use my original resume unchanged/ })
        .getAttribute("aria-checked"),
    ).toBe("true");

    view.unmount();
  });

  it("keeps workspace behavior staged while its scoped save stays pending and when it resolves false", async () => {
    let resolveBehavior: ((saved: boolean) => void) | null = null;
    const callbacks = createCallbacks();
    callbacks.onUpdateWorkspaceBehavior.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveBehavior = resolve;
        }),
    );
    const view = renderScreen(parseSettings(), callbacks);

    const workspace = screen.getByRole("region", {
      name: "Workspace behavior",
    });
    fireEvent.click(within(workspace).getAllByRole("switch")[0]!);
    fireEvent.click(
      within(workspace).getByRole<HTMLButtonElement>("button", {
        name: "Save workspace behavior",
      }),
    );

    expect(
      within(workspace).getByRole<HTMLButtonElement>("button", {
        name: "Saving workspace behavior",
      }).hasAttribute("disabled"),
    ).toBe(false);
    expect(
      within(workspace)
        .getByRole<HTMLButtonElement>("button", {
          name: "Saving workspace behavior",
        })
        .getAttribute("aria-disabled"),
    ).toBe("true");

    await act(() => {
      resolveBehavior?.(false);
      return Promise.resolve();
    });

    expect(
      within(workspace).getByText(
        "Workspace behavior was not saved. Retry before leaving this page.",
      ),
    ).toBeTruthy();
    expect(
      within(workspace).getAllByRole("switch")[0]!.getAttribute("aria-checked"),
    ).toBe("true");

    view.unmount();
  });

  it("keeps tracker edits staged while the CRM save pends and when it resolves false", async () => {
    let resolveTracker: ((saved: boolean) => void) | null = null;
    const callbacks = createCallbacks();
    callbacks.onUpdateTrackerCrm.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveTracker = resolve;
        }),
    );
    const crmSettings = ApplicationCrmSettingsSchema.parse({});
    const view = renderScreen(
      parseSettings({ applicationCrm: crmSettings }),
      callbacks,
    );

    const tracker = screen.getByRole("region", { name: "Tracker" });
    fireEvent.change(within(tracker).getByLabelText("After days"), {
      target: { value: "9" },
    });
    fireEvent.click(
      within(tracker).getByRole<HTMLButtonElement>("button", {
        name: "Save tracker settings",
      }),
    );

    // Submit stays pending for the IPC promise.
    await act(async () => {});
    expect(
      within(tracker).getByRole<HTMLButtonElement>("button", {
        name: "Saving…",
      }).disabled,
    ).toBe(true);

    await act(() => {
      resolveTracker?.(false);
      return Promise.resolve();
    });

    expect(within(tracker).getByRole("alert").textContent).toBe(
      "The application tracker settings could not be saved.",
    );
    // A failed save must not reset the staged tracker values.
    expect(
      within(tracker).getByLabelText<HTMLInputElement>("After days").value,
    ).toBe("9");
    expect(
      within(tracker).getByRole<HTMLButtonElement>("button", {
        name: "Save tracker settings",
      }).disabled,
    ).toBe(false);

    view.unmount();
  });

  it("resets tracker edits only after the CRM save resolves true", async () => {
    const callbacks = createCallbacks();
    callbacks.onUpdateTrackerCrm.mockResolvedValueOnce(true);
    const crmSettings = ApplicationCrmSettingsSchema.parse({});
    const view = renderScreen(
      parseSettings({ applicationCrm: crmSettings }),
      callbacks,
    );

    const tracker = screen.getByRole("region", { name: "Tracker" });
    fireEvent.change(within(tracker).getByLabelText("After days"), {
      target: { value: "9" },
    });
    fireEvent.click(
      within(tracker).getByRole<HTMLButtonElement>("button", {
        name: "Save tracker settings",
      }),
    );

    await waitFor(() =>
      expect(
        within(tracker).getByRole<HTMLButtonElement>("button", {
          name: "Save tracker settings",
        }).disabled,
      ).toBe(true),
    );
    expect(within(tracker).queryByRole("alert")).toBeNull();

    view.unmount();
  });
});
