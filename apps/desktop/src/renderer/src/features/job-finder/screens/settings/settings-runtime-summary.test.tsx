// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type {
  BrowserSessionState,
  JobFinderSettings,
} from "@unemployed/contracts";
import {
  getApplySafeguardCopy,
  SettingsRuntimeSummary,
} from "./settings-runtime-summary";

afterEach(cleanup);

const browserSession = {
  source: "target_site",
  status: "ready",
  driver: "chrome_profile_agent",
  label: "Browser ready",
  detail: null,
  lastCheckedAt: "2026-07-30T10:00:00.000Z",
} as BrowserSessionState;

const settings = {
  keepSessionAlive: false,
  discoveryOnly: true,
  resumeApplicationMode: "original_resume",
} as JobFinderSettings;

describe("getApplySafeguardCopy", () => {
  it("states prepare-only authority without claiming site outcomes", () => {
    for (const usesOriginalResume of [true, false]) {
      const copy = getApplySafeguardCopy(usesOriginalResume);
      expect(copy.description).toContain("stops before final submit");
      expect(copy.description).toMatch(/never performs it/);
      expect(copy.description).toMatch(/authorized steps may fill fields/i);
      expect(copy.description).toMatch(/the site controls its own behavior/i);
      expect(copy.description).not.toMatch(/no application was submitted/i);
    }
  });
});

describe("SettingsRuntimeSummary", () => {
  it("renders the apply safeguard disclosure", () => {
    render(
      <SettingsRuntimeSummary
        browserSession={browserSession}
        settings={settings}
      />,
    );

    expect(screen.getByText("Original resume required")).not.toBeNull();
    expect(
      screen.getByText(/never performs it; authorized steps may fill fields/),
    ).not.toBeNull();
  });
});
