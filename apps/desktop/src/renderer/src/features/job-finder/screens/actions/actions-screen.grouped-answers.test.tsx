// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import {
  GroupedManualAnswerDecisionSchema,
  UserActionRequestSchema,
  type ApplyGroupedManualAnswerInput,
  type CandidateProfile,
  type GroupedManualAnswerDecision,
  type JobFinderWorkspaceSnapshot,
  type ProjectGroupedManualAnswerCommand,
  type SnoozeGroupedDecisionInput,
  type UserActionCommandInput,
} from "@unemployed/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActionsScreen } from "./actions-screen";
import { deriveGroupedAnswerGroupKey } from "./answer-memory-editor";

afterEach(cleanup);

function createManualAnswerRequest(input: {
  id: string;
  jobId: string;
  revision?: number;
  state?: "pending" | "verifying" | "resolved";
}) {
  return UserActionRequestSchema.parse({
    id: input.id,
    dedupeKey: `dedupe_${input.id}`,
    revision: input.revision ?? 1,
    kind: "manual_answer",
    state: input.state ?? "pending",
    scope: {
      type: "application",
      runId: "run_1",
      jobId: input.jobId,
      source: "target_site",
    },
    verification: {
      type: "page_blocker_absent",
      blockerFingerprint: "blocker_1",
    },
    title: `Answer question for ${input.jobId}`,
    summary: "Review and answer the question in the browser.",
    actionUrl: "https://jobs.example.com/application",
    displayOrigin: "https://jobs.example.com/",
    createdAt: "2026-07-30T08:00:00.000Z",
    updatedAt: "2026-07-30T08:00:00.000Z",
  });
}

function createLineageEntry(entry: {
  requestId: string;
  jobId: string;
  applicationRecordId?: string;
  expectedRequestRevision?: number;
}) {
  return {
    requestId: entry.requestId,
    jobId: entry.jobId,
    applicationRecordId:
      entry.applicationRecordId ?? `application_${entry.jobId}`,
    resultId: null,
    questionId: "question_years",
    answerRecordId: null,
    expectedRequestRevision: entry.expectedRequestRevision ?? 1,
    expectedQuestionRevision: 1,
    expectedAnswerRevision: 0,
    appliedAt: null,
  };
}

function createDecision(
  overrides: Partial<GroupedManualAnswerDecision> = {},
): GroupedManualAnswerDecision {
  return GroupedManualAnswerDecisionSchema.parse({
    id: "group_1:abc123",
    groupKey: "group_1",
    requestId: "request_a",
    applicationRecordId: "application_job_a",
    jobId: "job_a",
    resultId: null,
    questionId: "question_years",
    expectedRevision: 1,
    expectedQuestionRevision: 1,
    expectedAnswerRevision: 0,
    fingerprints: {
      questionMeaning: "a".repeat(64),
      answerPolicy: "b".repeat(64),
    },
    answer: { type: "text", value: "5 years" },
    approval: "pending",
    conflict: { status: "none" },
    snooze: null,
    lineage: [
      createLineageEntry({ requestId: "request_a", jobId: "job_a" }),
      createLineageEntry({ requestId: "request_b", jobId: "job_b" }),
    ],
    createdAt: "2026-08-15T10:00:00.000Z",
    updatedAt: "2026-08-15T10:00:00.000Z",
    ...overrides,
  });
}

function createJobs(): JobFinderWorkspaceSnapshot["discoveryJobs"] {
  return [
    { id: "job_a", title: "Senior Engineer", company: "Acme" },
    { id: "job_b", title: "Staff Engineer", company: "Beta" },
    { id: "job_c", title: "Principal Engineer", company: "Gamma" },
  ] as unknown as JobFinderWorkspaceSnapshot["discoveryJobs"];
}

function renderScreen(props: {
  decision?: GroupedManualAnswerDecision;
  onApply?: (input: ApplyGroupedManualAnswerInput) => void;
  onProject?: (command: ProjectGroupedManualAnswerCommand) => void;
  onSnooze?: (input: SnoozeGroupedDecisionInput) => void;
  requests?: readonly ReturnType<typeof createManualAnswerRequest>[];
}) {
  const onApply = vi.fn(props.onApply ?? (() => undefined));
  const onProject = vi.fn(props.onProject ?? (() => undefined));
  const onSnooze = vi.fn(props.onSnooze ?? (() => undefined));
  const screen = render(
    <ActionsScreen
      discoveryJobs={createJobs()}
      groupedDecisions={props.decision ? [props.decision] : []}
      isPending={() => false}
      onApplyGroupedManualAnswer={onApply}
      onCommand={vi.fn<(command: UserActionCommandInput) => void>()}
      onNavigate={vi.fn()}
      onProjectGroupedManualAnswer={onProject}
      onSnoozeGroupedDecision={onSnooze}
      requests={props.requests ?? []}
    />,
  );
  return { onApply, onProject, onSnooze, screen };
}

describe("ActionsScreen persisted grouped reusable answers", () => {
  it("projects the typed draft as a reusable-profile command rooted at the request revision", () => {
    const request = createManualAnswerRequest({
      id: "request_a",
      jobId: "job_a",
      revision: 2,
    });
    const profile = {
      answerBank: { customAnswers: [] },
      proofBank: [],
    } as unknown as CandidateProfile;
    const applicationAttempts = [
      {
        jobId: "job_a",
        blocker: { code: "missing_candidate_answer" },
        questions: [
          {
            id: "question_years",
            prompt: "Years of experience",
            kind: "other",
            status: "detected",
          },
        ],
        updatedAt: "2026-08-15T09:00:00.000Z",
      },
    ] as unknown as JobFinderWorkspaceSnapshot["applicationAttempts"];
    const onProject =
      vi.fn<(command: ProjectGroupedManualAnswerCommand) => void>();

    const { getByLabelText, getByRole } = render(
      <ActionsScreen
        applicationAttempts={applicationAttempts}
        discoveryJobs={createJobs()}
        groupedDecisions={[]}
        isPending={() => false}
        onCommand={vi.fn()}
        onNavigate={vi.fn()}
        onProjectGroupedManualAnswer={onProject}
        profile={profile}
        requests={[request]}
      />,
    );

    fireEvent.change(getByLabelText("Answer draft"), {
      target: { value: "5 years" },
    });
    fireEvent.click(
      getByRole("button", { name: "Reuse for matching applications" }),
    );

    expect(onProject).toHaveBeenCalledWith({
      groupKey: deriveGroupedAnswerGroupKey("request_a"),
      requestId: "request_a",
      expectedRequestRevision: 2,
      answer: { type: "text", value: "5 years" },
      saveScope: "reusable_profile",
    });
  });

  it("shows the exact unique job count and full title/company lineage with revisions", () => {
    const decision = createDecision({
      lineage: [
        createLineageEntry({ requestId: "request_a", jobId: "job_a" }),
        createLineageEntry({ requestId: "request_b", jobId: "job_b" }),
        createLineageEntry({ requestId: "request_c", jobId: "job_c" }),
      ],
    });
    const { screen } = renderScreen({ decision });

    expect(
      screen.getByRole("heading", {
        name: "Reuse one answer across 3 jobs",
      }),
    ).toBeTruthy();
    expect(screen.getByText("5 years")).toBeTruthy();
    expect(screen.getByText("Senior Engineer at Acme")).toBeTruthy();
    expect(screen.getByText("Staff Engineer at Beta")).toBeTruthy();
    expect(screen.getByText("Principal Engineer at Gamma")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Approve & reuse for 3 jobs" }),
    ).toBeTruthy();
    expect(screen.getByText(/^request request_a · revision 1$/)).toBeTruthy();
    expect(screen.getByText(/^request request_b · revision 1$/)).toBeTruthy();
    expect(screen.getByText(/^request request_c · revision 1$/)).toBeTruthy();
  });

  it("hides ordinary member cards while a pending decision represents them", () => {
    const decision = createDecision();
    const requests = [
      createManualAnswerRequest({ id: "request_a", jobId: "job_a" }),
      createManualAnswerRequest({ id: "request_b", jobId: "job_b" }),
    ];
    const { screen } = renderScreen({ decision, requests });

    expect(screen.getByText("5 years")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Approve & reuse for 2 jobs" }),
    ).toBeTruthy();
    expect(screen.queryByText("Answer question for job_a")).toBeNull();
    expect(screen.queryByText("Answer question for job_b")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Applications" })).toBeNull();
  });

  it("approves with exactly the lineage ids, revisions, and persisted answer", () => {
    const decision = createDecision();
    const { onApply, screen } = renderScreen({ decision });

    fireEvent.click(
      screen.getByRole("button", { name: "Approve & reuse for 2 jobs" }),
    );

    expect(onApply).toHaveBeenCalledWith({
      decisionId: "group_1:abc123",
      requestIds: ["request_a", "request_b"],
      expectedRequestRevisions: { request_a: 1, request_b: 1 },
      answer: { type: "text", value: "5 years" },
    });
  });

  it("snoozes with the decision revision and a future note-free payload", () => {
    const decision = createDecision();
    const { onSnooze, screen } = renderScreen({ decision });

    fireEvent.click(screen.getByRole("button", { name: "Snooze 3 days" }));

    expect(onSnooze).toHaveBeenCalledTimes(1);
    const input = onSnooze.mock.calls[0]?.[0] as SnoozeGroupedDecisionInput;
    expect(input).toMatchObject({
      decisionId: "group_1:abc123",
      expectedRevision: 1,
      reason: null,
    });
    expect(Date.parse(input.until)).toBeGreaterThan(Date.now() - 1_000);
  });

  it("keeps a conflicted decision visible with reason/recovery while approval is disabled", () => {
    const decision = createDecision({
      conflict: {
        status: "detected",
        detectedAt: "2026-08-15T11:00:00.000Z",
        resolvedAt: null,
        conflictingDecisionId: null,
        summary: "A conflicting saved answer exists for this question.",
      },
    });
    const { screen } = renderScreen({ decision });

    expect(
      screen.getByText(/A conflicting saved answer exists for this question/),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(
      /Approval stays disabled until the conflict is resolved/i,
    );
    expect(
      screen.getByRole("button", { name: "Approve & reuse for 2 jobs" }),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("button", { name: "Snooze 3 days" }),
    ).toHaveProperty("disabled", false);
  });

  it("keeps snoozed decisions represented in the compact Snoozed section", () => {
    const decision = createDecision({
      snooze: {
        until: "2026-08-20T10:00:00.000Z",
        reason: "Ask the recruiter",
      },
    });
    const requests = [
      createManualAnswerRequest({ id: "request_a", jobId: "job_a" }),
      createManualAnswerRequest({ id: "request_b", jobId: "job_b" }),
    ];
    const { screen } = renderScreen({ decision, requests });

    expect(screen.getByRole("heading", { name: "Snoozed" })).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        name: "Snoozed reusable answer for 2 jobs",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/Snoozed until/i);
    expect(screen.getByRole("status").textContent).toContain(
      "Ask the recruiter",
    );
    expect(screen.queryByText("Answer question for job_a")).toBeNull();
    expect(screen.queryByText("Answer question for job_b")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Approve & reuse for 2 jobs" }),
    ).toBeTruthy();
  });

  it("lets ordinary member cards reappear after the decision is approved", () => {
    const decision = createDecision({
      approval: "approved",
      approvedAt: "2026-08-16T10:00:00.000Z",
    });
    const requests = [
      createManualAnswerRequest({
        id: "request_a",
        jobId: "job_a",
        state: "verifying",
      }),
      createManualAnswerRequest({
        id: "request_b",
        jobId: "job_b",
        state: "verifying",
      }),
    ];
    const { screen } = renderScreen({ decision, requests });

    expect(screen.queryByText("5 years")).toBeNull();
    expect(screen.queryByText("Reusable answers")).toBeNull();
    expect(screen.getByText("Answer question for job_a")).toBeTruthy();
    expect(screen.getByText("Answer question for job_b")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Applications" })).toBeTruthy();
  });
});
