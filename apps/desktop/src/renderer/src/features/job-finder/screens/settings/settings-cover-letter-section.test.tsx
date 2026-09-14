// @vitest-environment jsdom

import type { JobFinderSettings } from "@unemployed/contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingsCoverLetterSection } from "./settings-cover-letter-section";

/**
 * The letter preference, as a person meets it.
 *
 * What matters: the defaults are the unremarkable choice, the language field
 * explains that empty follows the posting, and the sample is described as a
 * voice rather than a source of facts.
 */

function settings(overrides: Partial<JobFinderSettings> = {}): JobFinderSettings {
  return {
    resumeFormat: "pdf",
    resumeTemplateId: "classic_ats",
    fontPreset: "inter_requisite",
    appearanceTheme: "system",
    humanReviewRequired: true,
    allowAutoSubmitOverride: false,
    keepSessionAlive: false,
    discoveryOnly: false,
    ...overrides,
  } as JobFinderSettings;
}

afterEach(() => {
  cleanup();
});

describe("SettingsCoverLetterSection", () => {
  it("starts from the plain default and says empty language follows the posting", () => {
    render(
      <SettingsCoverLetterSection
        onUpdateApplicationDefaults={vi.fn()}
        settings={settings()}
      />,
    );

    expect(screen.getByText("Cover letters")).toBeTruthy();
    expect(
      screen.getByText(/whatever language the posting uses/i),
    ).toBeTruthy();
    expect(
      screen.getByPlaceholderText(/Leave empty to match the job posting/i),
    ).toBeTruthy();
    // The sample is a voice, never a source of facts for another job.
    expect(
      screen.getByText(/copies how you sound, not what you said/i),
    ).toBeTruthy();
  });

  it("saves exactly what was chosen, trimming empties back to null", async () => {
    const onUpdateApplicationDefaults = vi.fn(() => Promise.resolve(true));
    render(
      <SettingsCoverLetterSection
        onUpdateApplicationDefaults={onUpdateApplicationDefaults}
        settings={settings()}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText(/Leave empty to match the job posting/i),
      { target: { value: "  German  " } },
    );
    fireEvent.change(
      screen.getByPlaceholderText(/Paste a letter you wrote yourself/i),
      { target: { value: "   " } },
    );
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(onUpdateApplicationDefaults).toHaveBeenCalledWith({
        coverLetter: {
          tone: "plain_professional",
          length: "standard",
          language: "German",
          sample: null,
        },
      }),
    );
  });

  it("shows a saved preference rather than the default", () => {
    render(
      <SettingsCoverLetterSection
        onUpdateApplicationDefaults={vi.fn()}
        settings={settings({
          coverLetter: {
            tone: "direct",
            length: "short",
            language: "Dutch",
            sample: null,
          },
        })}
      />,
    );

    expect(screen.getByDisplayValue("Dutch")).toBeTruthy();
    expect(screen.getByText(/Direct and brief/i)).toBeTruthy();
  });
});
