// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  ApplicationAnswerRecordSchema,
  ApplicationQuestionRecordSchema,
  ApplyJobResultSchema,
  ApplyRunDetailsSchema,
  ApplyRunSchema,
  CandidateAssetSchema,
} from "@unemployed/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationsDetailPanelReviewDataSection } from "./applications-detail-panel-review-data-section";

const now = "2026-08-10T10:00:00.000Z";

function createDetails(withAnswer = false) {
  const run = ApplyRunSchema.parse({
    id: "run-1",
    mode: "copilot",
    state: "paused_for_user_review",
    jobIds: ["job-1"],
    currentJobId: "job-1",
    summary: "Prepared safely",
    detail: "Final submission remains disabled.",
    createdAt: now,
    updatedAt: now,
  });
  const result = ApplyJobResultSchema.parse({
    id: "result-1",
    runId: run.id,
    jobId: "job-1",
    state: "awaiting_review",
    summary: "Review required answers",
    detail: "Nothing was submitted.",
    startedAt: now,
    updatedAt: now,
  });
  const question = ApplicationQuestionRecordSchema.parse({
    id: "question-1",
    runId: run.id,
    jobId: "job-1",
    resultId: result.id,
    prompt: "Will you require visa sponsorship?",
    kind: "visa_sponsorship",
    answerControlType: "single_choice",
    isRequired: true,
    detectedAt: now,
    answerOptions: ["Yes", "No"],
    selectedAnswerId: withAnswer ? "answer-1" : null,
    submittedAnswer: withAnswer ? "No" : null,
    status: withAnswer ? "answered" : "detected",
  });
  const answer = withAnswer
    ? ApplicationAnswerRecordSchema.parse({
        id: "answer-1",
        runId: run.id,
        jobId: "job-1",
        resultId: result.id,
        questionId: question.id,
        status: "suggested",
        text: "No",
        value: { type: "single_choice", value: "No" },
        revision: 2,
        sourceKind: "user",
        sourceId: "command-older",
        createdAt: now,
      })
    : null;
  return ApplyRunDetailsSchema.parse({
    run,
    result,
    results: [result],
    submitApproval: null,
    questionRecords: [question],
    answerRecords: answer ? [answer] : [],
    artifactRefs: [],
    checkpoints: [],
    consentRequests: [],
  });
}

describe("application question answer review", () => {
  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "unemployed");
  });

  it("saves an exact employer option without authorizing submission", async () => {
    const details = createDetails();
    const onSave = vi.fn(() => Promise.resolve());

    render(
      <ApplicationsDetailPanelReviewDataSection
        applyRunDetailsError={null}
        applyRunDetailsStatus="ready"
        isApplyRequestPending={() => false}
        onClearApplicationAnswer={vi.fn(() => Promise.resolve())}
        onResolveApplyConsentRequest={vi.fn()}
        onSaveApplicationAnswer={onSave}
        selectedApplyRunDetails={details}
        visibleApplyResult={details.result}
      />,
    );

    fireEvent.change(
      screen.getByRole("combobox", {
        name: "Answer for Will you require visa sponsorship?",
      }),
      { target: { value: "No" } },
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /also save this exact question and answer in profile/i,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save prepared answer" }),
    );

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        jobId: "job-1",
        resultId: "result-1",
        questionId: "question-1",
        expectedAnswerRevision: 0,
        value: { type: "single_choice", value: "No" },
        saveScope: "reusable_profile",
        submitAuthorized: false,
        accountCreationAuthorized: false,
      }),
    );
  });

  it("clears only the selected answer revision and keeps safety flags false", async () => {
    const details = createDetails(true);
    const onClear = vi.fn(() => Promise.resolve());

    render(
      <ApplicationsDetailPanelReviewDataSection
        applyRunDetailsError={null}
        applyRunDetailsStatus="ready"
        isApplyRequestPending={() => false}
        onClearApplicationAnswer={onClear}
        onResolveApplyConsentRequest={vi.fn()}
        onSaveApplicationAnswer={vi.fn(() => Promise.resolve())}
        selectedApplyRunDetails={details}
        visibleApplyResult={details.result}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Clear from this application" }),
    );

    await waitFor(() => expect(onClear).toHaveBeenCalledTimes(1));
    expect(onClear).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        jobId: "job-1",
        resultId: "result-1",
        questionId: "question-1",
        expectedAnswerRevision: 2,
        submitAuthorized: false,
        accountCreationAuthorized: false,
      }),
    );
  });

  it("selects an attachment-consented asset without exposing its path", async () => {
    const baseDetails = createDetails();
    const details = ApplyRunDetailsSchema.parse({
      ...baseDetails,
      questionRecords: [
        {
          ...baseDetails.questionRecords[0],
          prompt: "Upload a portfolio",
          kind: "portfolio",
          answerControlType: "file",
          answerOptions: [],
        },
      ],
    });
    const asset = CandidateAssetSchema.parse({
      id: "asset-portfolio",
      kind: "portfolio",
      originalName: "portfolio.pdf",
      mime: "application/pdf",
      byteSize: 100,
      sha256: "a".repeat(64),
      createdAt: now,
      sensitivity: "sensitive",
      consentScope: "job_application_attachment",
      retention: "until_deleted",
    });
    const onSave = vi.fn(() => Promise.resolve());
    Object.defineProperty(window, "unemployed", {
      configurable: true,
      value: {
        jobFinder: {
          listCandidateAssets: vi.fn(() =>
            Promise.resolve({ assets: [asset] }),
          ),
        },
      },
    });

    render(
      <ApplicationsDetailPanelReviewDataSection
        applyRunDetailsError={null}
        applyRunDetailsStatus="ready"
        isApplyRequestPending={() => false}
        onClearApplicationAnswer={vi.fn(() => Promise.resolve())}
        onResolveApplyConsentRequest={vi.fn()}
        onSaveApplicationAnswer={onSave}
        selectedApplyRunDetails={details}
        visibleApplyResult={details.result}
      />,
    );

    const selector = await screen.findByRole("combobox", {
      name: "Answer for Upload a portfolio",
    });
    fireEvent.change(selector, { target: { value: asset.id } });
    fireEvent.click(
      screen.getByRole("button", { name: "Save prepared answer" }),
    );

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        value: { type: "asset_ref", assetId: asset.id },
        saveScope: "application_once",
        submitAuthorized: false,
        accountCreationAuthorized: false,
      }),
    );
    expect(document.body.textContent).not.toContain("C:/");
  });

  it("makes the saved answer retry path explicit without widening authority", () => {
    const details = createDetails(true);

    render(
      <ApplicationsDetailPanelReviewDataSection
        applyRunDetailsError={null}
        applyRunDetailsStatus="ready"
        isApplyRequestPending={() => false}
        onClearApplicationAnswer={vi.fn(() => Promise.resolve())}
        onResolveApplyConsentRequest={vi.fn()}
        onSaveApplicationAnswer={vi.fn(() => Promise.resolve())}
        selectedApplyRunDetails={details}
        visibleApplyResult={details.result}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Needs you" }).getAttribute("href"),
    ).toBe("#/job-finder/actions");
    expect(
      screen.getByText(
        /final submission and account creation remain disabled/i,
      ),
    ).toBeTruthy();
  });
});
