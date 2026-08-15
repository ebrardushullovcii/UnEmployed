// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecordOutcomeInput } from "@unemployed/contracts";
import { ApplicationsOutcomeRecorder } from "./applications-outcome-recorder";

describe("ApplicationsOutcomeRecorder", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("records the chosen outcome for the job with the attached resume strategy", async () => {
    const onRecordOutcome = vi
      .fn<(input: RecordOutcomeInput) => Promise<void>>()
      .mockResolvedValue(undefined);
    render(
      <ApplicationsOutcomeRecorder
        isPending={false}
        jobId="job-1"
        onRecordOutcome={onRecordOutcome}
        resumeStrategyId="strategy-1"
      />,
    );

    fireEvent.change(screen.getByLabelText(/Outcome/), {
      target: { value: "interview" },
    });
    fireEvent.change(screen.getByLabelText(/Note \(optional\)/), {
      target: { value: "Recruiter call went well" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record outcome" }));

    await vi.waitFor(() => {
      expect(onRecordOutcome).toHaveBeenCalledWith({
        jobId: "job-1",
        outcome: "interview",
        resumeStrategyId: "strategy-1",
        note: "Recruiter call went well",
      });
    });
  });

  it("recording Applied is a manual outcome only and never fabricates submission evidence", async () => {
    const onRecordOutcome = vi
      .fn<(input: RecordOutcomeInput) => Promise<void>>()
      .mockResolvedValue(undefined);
    render(
      <ApplicationsOutcomeRecorder
        isPending={false}
        jobId="job-1"
        onRecordOutcome={onRecordOutcome}
        resumeStrategyId={null}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Outcome/), {
      target: { value: "applied" },
    });
    expect(
      screen.getByText(/does not claim that a browser submission happened/i),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Record outcome" }));

    await vi.waitFor(() => {
      expect(onRecordOutcome).toHaveBeenCalledWith({
        jobId: "job-1",
        outcome: "applied",
        resumeStrategyId: null,
        note: null,
      });
    });
    expect(onRecordOutcome.mock.calls[0]?.[0]).not.toHaveProperty(
      "submissionEvidence",
    );
    expect(onRecordOutcome.mock.calls[0]?.[0]).not.toHaveProperty("runId");
    expect(onRecordOutcome.mock.calls[0]?.[0]).not.toHaveProperty(
      "submittedAt",
    );
  });

  it("offers every requested recording kind without any submit authority", () => {
    render(
      <ApplicationsOutcomeRecorder
        isPending={false}
        jobId="job-1"
        onRecordOutcome={async () => undefined}
        resumeStrategyId={null}
      />,
    );

    const select = screen.getByLabelText(/Outcome/) as HTMLSelectElement;
    const optionValues = [...select.options].map((option) => option.value);

    expect(optionValues).toEqual(
      expect.arrayContaining([
        "application_completed",
        "abandoned",
        "applied",
        "employer_response",
        "assessment",
        "interview",
        "offer",
        "rejected",
        "withdrawn",
        "no_response",
      ]),
    );
    expect(optionValues).not.toContain("submitted");
    expect(screen.queryByRole("button", { name: /submit/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /approve/i })).toBeNull();
  });

  it("surfaces a record failure as an alert and keeps the form filled", async () => {
    const onRecordOutcome = vi
      .fn<(input: RecordOutcomeInput) => Promise<void>>()
      .mockRejectedValue(new Error("That job is no longer available."));
    render(
      <ApplicationsOutcomeRecorder
        isPending={false}
        jobId="job-1"
        onRecordOutcome={onRecordOutcome}
        resumeStrategyId={null}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Outcome/), {
      target: { value: "offer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record outcome" }));

    await vi.waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(
        /That job is no longer available/,
      );
    });
    expect((screen.getByLabelText(/Outcome/) as HTMLSelectElement).value).toBe(
      "offer",
    );
  });

  it("does not record without a chosen outcome", () => {
    const onRecordOutcome = vi
      .fn<(input: RecordOutcomeInput) => Promise<void>>()
      .mockResolvedValue(undefined);
    render(
      <ApplicationsOutcomeRecorder
        isPending={false}
        jobId="job-1"
        onRecordOutcome={onRecordOutcome}
        resumeStrategyId={null}
      />,
    );

    const recordButton = screen.getByRole("button", {
      name: "Record outcome",
    }) as HTMLButtonElement;
    expect(recordButton.disabled).toBe(true);
    fireEvent.click(recordButton);
    expect(onRecordOutcome).not.toHaveBeenCalled();
  });

  it("disables controls while a record is pending", () => {
    render(
      <ApplicationsOutcomeRecorder
        isPending
        jobId="job-1"
        onRecordOutcome={async () => undefined}
        resumeStrategyId={null}
      />,
    );

    expect(
      (screen.getByLabelText(/Outcome/) as HTMLSelectElement).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Record outcome",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
