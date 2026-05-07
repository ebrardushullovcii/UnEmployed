import { describe, expect, test } from "vitest";
import {
  BrowserVisualObservationSetSchema,
  type BrowserVisualAnalysisInput,
} from "@unemployed/contracts";
import { createDeterministicBrowserVisualAnalysisProvider } from "./browser-visual-analysis";

function createInput(overrides: Partial<BrowserVisualAnalysisInput> = {}): BrowserVisualAnalysisInput {
  const base: BrowserVisualAnalysisInput = {
    snapshot: {
      id: "visual_snapshot_1",
      capturedAt: "2026-03-20T10:00:00.000Z",
      url: "https://jobs.example.com/apply",
      pageTitle: "Apply",
      mode: "viewport",
      purpose: "apply_checkpoint",
      label: "Apply checkpoint",
      region: null,
      viewport: { x: 0, y: 0, width: 1440, height: 900 },
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,ZmFrZQ==",
      storagePath: null,
      retention: {
        retention: "temporary",
        redactionLevel: "sensitive",
        reason: "Temporary apply visual analysis.",
        expiresAt: null,
      },
      warnings: [],
    },
    context: {
      purpose: "apply_checkpoint",
      taskGoal: "Classify visible apply form state without taking action.",
      pageUrl: "https://jobs.example.com/apply",
      pageTitle: "Apply",
      visibleTextSample:
        "Upload resume. Email is required. Apply button is disabled until required fields are complete.",
      domSignals: ["DOM field snapshot was incomplete."],
      sourceDebug: null,
      apply: {
        jobTitle: "Senior Engineer",
        company: "Example Co",
        checkpointLabel: "Review visible form state",
        recoveryMode: false,
      },
    },
  };

  return {
    ...base,
    ...overrides,
  };
}

describe("browser visual analysis providers", () => {
  test("deterministic provider returns schema-valid apply observations", async () => {
    const provider = createDeterministicBrowserVisualAnalysisProvider();

    const result = await provider.analyzeBrowserVisualSnapshot(createInput());

    expect(result.providerKind).toBe("deterministic");
    expect(result.fieldControls).toEqual(
      expect.arrayContaining([
        expect.stringContaining("resume"),
        expect.stringContaining("upload"),
      ]),
    );
    expect(result.validationErrors[0]).toContain("required");
    expect(BrowserVisualObservationSetSchema.parse(result).snapshotId).toBe(
      "visual_snapshot_1",
    );
  });

  test("visual schema rejects selectors and action directives", () => {
    expect(() =>
      BrowserVisualObservationSetSchema.parse({
        id: "visual_observation_bad",
        snapshotId: "visual_snapshot_bad",
        observedAt: "2026-03-20T10:00:00.000Z",
        purpose: "apply_checkpoint",
        providerKind: "deterministic",
        providerLabel: "Deterministic browser visual analysis",
        visibleControls: ["Click the #submit button"],
      }),
    ).toThrow(/cannot include selectors|cannot direct browser actions/i);
  });
});
