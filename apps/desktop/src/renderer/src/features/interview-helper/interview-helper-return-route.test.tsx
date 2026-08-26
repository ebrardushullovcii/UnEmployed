// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { InterviewWorkspaceSnapshot } from "@unemployed/contracts";

import { InterviewHelperPage } from "./interview-helper-page";

const LAST_JOB_FINDER_ROUTE_STORAGE_KEY =
  "unemployed.interview-helper.last-job-finder-route";

vi.mock("./interview-media-stream-probes", () => ({
  InterviewMediaStreamProbes: () => <div data-testid="media-probes-stub" />,
}));

function createWorkspace(): InterviewWorkspaceSnapshot {
  return {
    module: "interview-helper",
    generatedAt: "2026-08-01T09:00:00.000Z",
    setup: {
      consent: {
        microphoneCapture: false,
        meetingAudioCapture: false,
        screenshotCapture: true,
        modelTransmission: true,
        localRetention: true,
        overlayProtectionNotice: true,
        acceptedAt: "2026-08-01T08:59:00.000Z",
      },
      targetContext: null,
      prepArtifacts: [],
      rehearsal: null,
      transcriptionLanguage: "en-US",
      cueSensitivity: "conservative",
      autoCaptureOnCue: false,
    },
    activeSession: null,
    recentSessions: [],
    answerOverlay: {
      surfaceKind: "live_answer_overlay",
      mode: "popup_window",
      visible: true,
      interactionMode: false,
      opacity: 1,
      protectionState: "best_effort",
      currentCue: null,
      statusLabel: "Live",
    },
    transcriptOverlay: {
      surfaceKind: "live_transcript_overlay",
      mode: "popup_window",
      visible: true,
      interactionMode: false,
      opacity: 1,
      protectionState: "best_effort",
      currentCue: null,
      statusLabel: "Live",
    },
  } as unknown as InterviewWorkspaceSnapshot;
}

function installDesktopApi(workspace: InterviewWorkspaceSnapshot) {
  const interviewHelper = {
    getWorkspace: vi.fn().mockResolvedValue(workspace),
    onWorkspaceChange: vi.fn().mockReturnValue(() => undefined),
  };
  Object.defineProperty(window, "unemployed", {
    configurable: true,
    value: {
      interviewHelper,
      ping: vi.fn().mockResolvedValue({ platform: "darwin" }),
      window: {
        getControlsState: vi.fn().mockResolvedValue({
          isClosable: true,
          isMaximized: false,
          isMinimizable: true,
        }),
        onControlsStateChange: vi.fn().mockReturnValue(() => undefined),
      },
    },
  });
}

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="route-probe">{location.pathname}</p>;
}

function renderInterviewShell() {
  window.location.hash = "#/interview-helper";
  return render(
    <HashRouter>
      <Routes>
        <Route element={<InterviewHelperPage />} path="/interview-helper" />
        <Route element={<LocationProbe />} path="*" />
      </Routes>
    </HashRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("Interview Helper product-switcher return target", () => {
  test("navigates to the Job Finder root when no route was recorded yet", async () => {
    installDesktopApi(createWorkspace());
    const rendered = renderInterviewShell();

    const jobFinderButton = await rendered.findByRole("button", {
      name: "Job Finder",
    });

    expect(rendered.getByText("UNEMPLOYED").getAttribute("href")).toBe(
      "#/job-finder",
    );

    fireEvent.click(jobFinderButton);

    const probe = await rendered.findByTestId("route-probe");
    expect(probe.textContent).toBe("/job-finder");
  });

  test("navigates to the last visited Job Finder route once recorded", async () => {
    window.sessionStorage.setItem(
      LAST_JOB_FINDER_ROUTE_STORAGE_KEY,
      "/job-finder/applications",
    );
    installDesktopApi(createWorkspace());

    const outboundVisit = renderInterviewShell();

    expect(
      (await outboundVisit.findByText("UNEMPLOYED")).getAttribute("href"),
    ).toBe("#/job-finder/applications");

    fireEvent.click(
      outboundVisit.getByRole("link", { name: "Open Job Finder" }),
    );
    expect((await outboundVisit.findByTestId("route-probe")).textContent).toBe(
      "/job-finder/applications",
    );

    cleanup();
    const returnVisit = renderInterviewShell();

    fireEvent.click(
      await returnVisit.findByRole("button", { name: "Job Finder" }),
    );
    const returnProbe = await returnVisit.findByTestId("route-probe");
    expect(returnProbe.textContent).toBe("/job-finder/applications");
  });

  test("records Job Finder routes reached while Interview Helper is mounted", async () => {
    installDesktopApi(createWorkspace());
    const rendered = renderInterviewShell();

    await rendered.findByRole("button", { name: "Job Finder" });
    fireEvent.click(rendered.getByRole("button", { name: "Job Finder" }));
    await rendered.findByTestId("route-probe");

    expect(
      window.sessionStorage.getItem(LAST_JOB_FINDER_ROUTE_STORAGE_KEY),
    ).toBe("/job-finder");
  });

  test("module switcher marks Interview Helper current and keeps Job Finder interactive", async () => {
    installDesktopApi(createWorkspace());
    const rendered = renderInterviewShell();

    // Mirrors the Job Finder shell contract: the current module is a
    // non-interactive aria-current marker; only the other module stays a
    // focusable button.
    const jobFinderButton = await rendered.findByRole("button", {
      name: "Job Finder",
    });
    const moduleNav = rendered.container.querySelector(
      "[data-desktop-module-navigation]",
    );
    if (!moduleNav) {
      throw new Error("Desktop module navigation is missing");
    }

    const currentModules = Array.from(
      moduleNav.querySelectorAll('[aria-current="page"]'),
    );
    expect(currentModules).toHaveLength(1);
    expect(currentModules[0]?.tagName).toBe("SPAN");
    expect(currentModules[0]?.textContent).toBe("Interview Helper");
    expect(moduleNav.querySelector("button[aria-current]")).toBeNull();
    expect(jobFinderButton.getAttribute("aria-current")).toBeNull();
  });
});
