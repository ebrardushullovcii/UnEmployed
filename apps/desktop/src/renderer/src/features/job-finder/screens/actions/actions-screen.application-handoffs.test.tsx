// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import {
  UserActionRequestSchema,
  type JobFinderWorkspaceSnapshot,
} from "@unemployed/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActionsScreen } from "./actions-screen";

afterEach(cleanup);

function request(input: {
  kind: "login" | "manual_upload";
  verification: Record<string, unknown>;
  summary?: string;
}) {
  return UserActionRequestSchema.parse({
    id: `action_${input.kind}`,
    dedupeKey: `dedupe_${input.kind}`,
    revision: 1,
    kind: input.kind,
    state: "page_opened",
    scope: {
      type: "application",
      runId: "run_1",
      jobId: "job_1",
      resultId: "result_1",
      applicationRecordId: "application_job_1",
      source: "target_site",
    },
    verification: input.verification,
    title: input.kind === "login" ? "Sign in to continue" : "Attach a file",
    summary: input.summary ?? "The application needs you.",
    actionUrl: "https://jobs.example.com/application",
    displayOrigin: "https://jobs.example.com/",
    createdAt: "2026-09-23T08:00:00.000Z",
    updatedAt: "2026-09-23T08:00:00.000Z",
  });
}

describe("Needs you application hand-offs that carry on by themselves", () => {
  it("offers no check press for an application sign-in Job Finder watches", () => {
    const { getByRole, getByTestId, queryByRole } = render(
      <ActionsScreen
        discoveryJobs={[]}
        isPending={() => false}
        onCommand={vi.fn()}
        onNavigate={vi.fn()}
        requests={[
          request({
            kind: "login",
            verification: {
              type: "source_access",
              blockerFingerprint: "blocker_login",
              expectedOrigin: "https://jobs.example.com/",
            },
          }),
        ]}
      />,
    );

    expect(
      getByRole("button", { name: "Open the Job Finder browser" }),
    ).toBeTruthy();
    expect(
      queryByRole("button", { name: "Check whether this step is done" }),
    ).toBeNull();
    expect(getByTestId("needs-you-sign-in-continues-note").textContent).toMatch(
      /carries on with this application by itself/i,
    );
  });

  it("sends a waiting file question to Profile › Files", () => {
    const onNavigate = vi.fn();
    const applicationAttempts = [
      {
        applicationRecordId: "application_job_1",
        jobId: "job_1",
        blocker: { code: "missing_candidate_answer" },
        questions: [
          {
            id: "question_portfolio",
            prompt: "Portfolio",
            kind: "portfolio",
            answerControlType: "file",
            status: "detected",
          },
        ],
        updatedAt: "2026-09-23T08:00:00.000Z",
      },
    ] as unknown as JobFinderWorkspaceSnapshot["applicationAttempts"];
    const { getByRole, getByTestId } = render(
      <ActionsScreen
        applicationAttempts={applicationAttempts}
        discoveryJobs={[]}
        isPending={() => false}
        onCommand={vi.fn()}
        onNavigate={onNavigate}
        requests={[
          request({
            kind: "manual_upload",
            verification: {
              type: "page_blocker_absent",
              blockerFingerprint: "blocker_1",
            },
          }),
        ]}
      />,
    );

    expect(getByTestId("needs-you-file-continues-note").textContent).toMatch(
      /carries on with this application by itself/i,
    );
    fireEvent.click(
      getByRole("button", { name: "Choose a file in Profile › Files" }),
    );
    expect(onNavigate).toHaveBeenCalledWith(
      "/job-finder/profile?section=files",
    );
  });

  it("says the Files sentence once when the step already says it", () => {
    const applicationAttempts = [
      {
        applicationRecordId: "application_job_1",
        jobId: "job_1",
        blocker: { code: "missing_candidate_answer" },
        questions: [
          {
            id: "question_portfolio",
            prompt: "Portfolio",
            kind: "portfolio",
            answerControlType: "file",
            status: "detected",
          },
        ],
        updatedAt: "2026-09-23T08:00:00.000Z",
      },
    ] as unknown as JobFinderWorkspaceSnapshot["applicationAttempts"];
    const { queryByTestId, getByRole } = render(
      <ActionsScreen
        applicationAttempts={applicationAttempts}
        discoveryJobs={[]}
        isPending={() => false}
        onCommand={vi.fn()}
        onNavigate={vi.fn()}
        requests={[
          request({
            kind: "manual_upload",
            summary:
              "The form needs a portfolio. Add or restore the file in Profile › Files and Job Finder attaches it and carries on by itself.",
            verification: {
              type: "page_blocker_absent",
              blockerFingerprint: "blocker_1",
            },
          }),
        ]}
      />,
    );

    expect(queryByTestId("needs-you-file-continues-note")).toBeNull();
    expect(
      getByRole("button", { name: "Choose a file in Profile › Files" }),
    ).toBeTruthy();
  });
});
