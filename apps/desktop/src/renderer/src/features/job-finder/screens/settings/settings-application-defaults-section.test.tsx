// @vitest-environment jsdom

import type {
  JobFinderSettings,
  UpdateApplicationDefaultsInput,
} from "@unemployed/contracts";
import { JobFinderSettingsSchema } from "@unemployed/contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsApplicationDefaultsSection } from "./settings-application-defaults-section";

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

describe("SettingsApplicationDefaultsSection", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("keeps the explicit near-choice resume flow and stages without saving", () => {
    const onUpdateApplicationDefaults = vi.fn<
      (input: UpdateApplicationDefaultsInput) => Promise<void>
    >(() => Promise.resolve());
    const { container } = render(
      <SettingsApplicationDefaultsSection
        availableResumeTemplates={[]}
        onUpdateApplicationDefaults={onUpdateApplicationDefaults}
        settings={parseSettings()}
      />,
    );

    const originalCvChoice = screen.getByRole("radio", {
      name: /Use my original resume unchanged/,
    });
    expect(originalCvChoice.getAttribute("aria-checked")).toBe("false");
    expect(container.textContent).toContain("Saved default");
    expect(
      screen.getByRole("group", { name: "Default resume template" }),
    ).toBeTruthy();

    fireEvent.click(originalCvChoice);

    expect(originalCvChoice.getAttribute("aria-checked")).toBe("true");
    expect(container.textContent).toContain("Selected · save to apply");
    expect(container.textContent).toContain(
      "Save this preference before leaving Settings.",
    );
    expect(onUpdateApplicationDefaults).not.toHaveBeenCalled();

    const saveButton = screen.getByRole<HTMLButtonElement>("button", {
      name: "Save resume preference",
    });
    expect(saveButton.disabled).toBe(false);
  });

  it("sends only application-defaults fields and reports saved status", async () => {
    const onUpdateApplicationDefaults = vi.fn<
      (input: UpdateApplicationDefaultsInput) => Promise<void>
    >(() => Promise.resolve());
    render(
      <SettingsApplicationDefaultsSection
        availableResumeTemplates={[]}
        onUpdateApplicationDefaults={onUpdateApplicationDefaults}
        settings={parseSettings()}
      />,
    );

    fireEvent.click(
      screen.getByRole("radio", { name: /Use my original resume unchanged/ }),
    );
    fireEvent.click(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Save resume preference",
      }),
    );

    await waitFor(() =>
      expect(onUpdateApplicationDefaults).toHaveBeenCalledTimes(1),
    );
    expect(onUpdateApplicationDefaults).toHaveBeenCalledWith({
      fontPreset: "inter_requisite",
      resumeApplicationMode: "original_resume",
      resumeTemplateId: "classic_ats",
    });
    const payload = onUpdateApplicationDefaults.mock.calls[0]?.[0];
    expect(Object.keys(payload ?? {}).sort()).toEqual([
      "fontPreset",
      "resumeApplicationMode",
      "resumeTemplateId",
    ]);
    expect(
      screen.getByText("Resume preference saved for newly shortlisted jobs."),
    ).toBeTruthy();
  });

  it("resets staged drafts when the persisted settings prop refreshes", () => {
    const onUpdateApplicationDefaults = vi.fn<
      (input: UpdateApplicationDefaultsInput) => Promise<void>
    >(() => Promise.resolve());
    const view = render(
      <SettingsApplicationDefaultsSection
        availableResumeTemplates={[]}
        onUpdateApplicationDefaults={onUpdateApplicationDefaults}
        settings={parseSettings()}
      />,
    );

    fireEvent.click(
      screen.getByRole("radio", { name: /Use my original resume unchanged/ }),
    );
    expect(
      screen.getByText("You have unsaved resume preference changes."),
    ).toBeTruthy();

    view.rerender(
      <SettingsApplicationDefaultsSection
        availableResumeTemplates={[]}
        onUpdateApplicationDefaults={onUpdateApplicationDefaults}
        settings={parseSettings({ resumeApplicationMode: "original_resume" })}
      />,
    );

    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Save resume preference",
      }).disabled,
    ).toBe(true);
    expect(
      screen.queryByText("You have unsaved resume preference changes."),
    ).toBeNull();
  });
});
