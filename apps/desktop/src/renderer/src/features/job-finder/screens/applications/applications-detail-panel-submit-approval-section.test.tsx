// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ApplyRunDetails } from "@unemployed/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationsDetailPanelSubmitApprovalSection } from "./applications-detail-panel-submit-approval-section";

afterEach(cleanup);

function createAwaitingApprovalDetails(): ApplyRunDetails {
  return {
    run: {
      id: "run_1",
      campaignId: null,
      mode: "queue_auto",
      state: "awaiting_submit_approval",
      jobIds: ["job_1"],
      currentJobId: "job_1",
      submitApprovalId: "approval_1",
      visualCheckpointsEnabled: false,
      createdAt: "2026-08-09T08:00:00.000Z",
      updatedAt: "2026-08-09T08:01:00.000Z",
      completedAt: null,
      summary: "Ready for safe preparation approval.",
      detail: "Final submission remains disabled.",
      totalJobs: 1,
      pendingJobs: 1,
      submittedJobs: 0,
      skippedJobs: 0,
      blockedJobs: 0,
      failedJobs: 0,
    },
    result: null,
    results: [],
    submitApproval: {
      id: "approval_1",
      runId: "run_1",
      mode: "queue_auto",
      jobIds: ["job_1"],
      status: "pending",
      createdAt: "2026-08-09T08:01:00.000Z",
      approvedAt: null,
      revokedAt: null,
      expiresAt: null,
      detail: "Preparation only.",
    },
    questionRecords: [],
    answerRecords: [],
    artifactRefs: [],
    checkpoints: [],
    consentRequests: [],
  };
}

describe("ApplicationsDetailPanelSubmitApprovalSection", () => {
  it("frames approval as preparation without granting submission or account authority", () => {
    const onApproveApplyRun = vi.fn();
    render(
      <ApplicationsDetailPanelSubmitApprovalSection
        approvalScopeEntries={[{ jobId: "job_1", label: "Engineer at Acme" }]}
        isApplyRunPending={() => false}
        isSelectedRunPending={false}
        onApproveApplyRun={onApproveApplyRun}
        onCancelApplyRun={vi.fn()}
        onRevokeApplyRunApproval={vi.fn()}
        selectedApplyRunDetails={createAwaitingApprovalDetails()}
        selectedApplicationTarget={{
          jobId: "job-1",
          applicationRecordId: "application-1",
        }}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Preparation approval" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/does not authorize account creation/i),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Job Finder cannot create accounts or submit applications/i,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/submit on each employer site yourself/i),
    ).toBeTruthy();
    expect(
      screen.queryByText(/automatic application authorization/i),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Approve safe preparation" }),
    );
    expect(onApproveApplyRun).toHaveBeenCalledWith({
      runId: "run_1",
      jobId: "job-1",
      applicationRecordId: "application-1",
    });
  });

  it("never teaches submit-approval or copilot wording at the approval decision point", () => {
    render(
      <ApplicationsDetailPanelSubmitApprovalSection
        approvalScopeEntries={[{ jobId: "job_1", label: "Engineer at Acme" }]}
        isApplyRunPending={() => false}
        isSelectedRunPending={false}
        onApproveApplyRun={vi.fn()}
        onCancelApplyRun={vi.fn()}
        onRevokeApplyRunApproval={vi.fn()}
        selectedApplyRunDetails={createAwaitingApprovalDetails()}
        selectedApplicationTarget={{
          jobId: "job-1",
          applicationRecordId: "application-1",
        }}
      />,
    );

    expect(document.body.textContent ?? "").toMatch(
      /Preparation approval applies only to these jobs/,
    );
    expect(document.body.textContent ?? "").not.toMatch(
      /submit approval|apply copilot|restage/i,
    );
  });
});
