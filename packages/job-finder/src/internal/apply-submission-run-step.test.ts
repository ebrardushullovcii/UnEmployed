import { describe, expect, test, vi } from "vitest";

import type * as HandoffModule from "./apply-submission-handoff";

const submitPreparedApplication =
  vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock("./apply-submission-handoff", async (importOriginal) => ({
  ...(await importOriginal<typeof HandoffModule>()),
  submitPreparedApplication: (...args: unknown[]) =>
    submitPreparedApplication(...args),
}));

const { sendPreparedApplicationIfAllowed } =
  await import("./apply-submission-run-step");

function sendInput(
  releaseApplicationPageBinding: ReturnType<typeof vi.fn>,
  mode = "autonomous_submit",
  confirmedByPerson = false,
) {
  return {
    ctx: {
      repository: {
        getSettings: () =>
          Promise.resolve({ applicationAutomationMode: mode }),
      },
      browserRuntime: {
        observeApplicationForm: vi.fn(),
        executeExactlyOneFinalAction: vi.fn(),
        hasApplicationPageBinding: vi.fn(() => Promise.resolve(true)),
        releaseApplicationPageBinding,
      },
    },
    handoff: { status: "send_now", confirmedByPerson },
    envelope: { id: "envelope_1" },
    source: { id: "source_1" },
    lineage: { resultId: "result_1" },
    resumeArtifact: { filePath: "/tmp/resume.pdf" },
    siteLabel: "Example Jobs",
  } as unknown as Parameters<typeof sendPreparedApplicationIfAllowed>[0];
}

describe("sending a prepared application", () => {
  test("lets go of the page once the employer confirmed receipt", async () => {
    const release = vi.fn(() => Promise.resolve());
    submitPreparedApplication.mockResolvedValueOnce({ status: "submitted" });

    const sent = await sendPreparedApplicationIfAllowed(sendInput(release));

    expect(sent?.confirmedSubmitted).toBe(true);
    expect(release).toHaveBeenCalledWith({ id: "source_1" }, "result_1");
  });

  test("keeps the page when the outcome is not confirmed", async () => {
    const release = vi.fn(() => Promise.resolve());
    submitPreparedApplication.mockResolvedValueOnce({
      status: "outcome_uncertain",
    });

    await sendPreparedApplicationIfAllowed(sendInput(release));

    expect(release).not.toHaveBeenCalled();
  });

  test("a switch away from Send for me mid-batch stops the sends not made yet", async () => {
    submitPreparedApplication.mockClear();
    const release = vi.fn(() => Promise.resolve());
    for (const mode of ["prepare_only", "confirm_before_submit"]) {
      expect(
        await sendPreparedApplicationIfAllowed(sendInput(release, mode)),
      ).toBeNull();
    }
    expect(submitPreparedApplication).not.toHaveBeenCalled();

    // A send the person confirmed themselves still goes.
    submitPreparedApplication.mockResolvedValueOnce({ status: "submitted" });
    const sent = await sendPreparedApplicationIfAllowed(
      sendInput(release, "confirm_before_submit", true),
    );
    expect(sent?.confirmedSubmitted).toBe(true);
  });
});
