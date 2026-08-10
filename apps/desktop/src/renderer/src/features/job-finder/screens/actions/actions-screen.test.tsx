// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import {
  UserActionRequestSchema,
  type UserActionCommandInput,
} from "@unemployed/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActionsScreen } from "./actions-screen";

afterEach(cleanup);

function createRequest(input: {
  actionUrl?: string | null;
  id: string;
  scope: "application" | "discovery_source";
  attemptCount?: number;
  state?: "pending" | "still_blocked" | "verifying" | "resolved";
}) {
  const applicationScope = {
    type: "application" as const,
    runId: "run_1",
    jobId: "job_1",
    resultId: null,
    replayCheckpointId: null,
    source: "target_site" as const,
  };
  const discoveryScope = {
    type: "discovery_source" as const,
    targetId: "target_1",
    source: "target_site" as const,
    sourceDebugRunId: null,
    sourceDebugAttemptId: null,
  };

  return UserActionRequestSchema.parse({
    id: input.id,
    dedupeKey: `dedupe_${input.id}`,
    revision: 1,
    kind: "login",
    state: input.state ?? "pending",
    scope: input.scope === "application" ? applicationScope : discoveryScope,
    verification:
      input.scope === "application"
        ? { type: "page_blocker_absent", blockerFingerprint: "blocker_1" }
        : {
            type: "source_access",
            targetId: "target_1",
            blockerFingerprint: "blocker_1",
          },
    title:
      input.scope === "application"
        ? "Finish application sign-in"
        : "Sign in to source",
    summary: "Use the managed browser, then return here.",
    actionUrl:
      input.actionUrl === undefined
        ? "https://jobs.example.com/login"
        : input.actionUrl,
    displayOrigin: "https://jobs.example.com/",
    credentialsPolicy: "browser_only",
    submitAuthorized: false,
    accountCreationAuthorized: false,
    attemptCount: input.attemptCount ?? 0,
    maxAttempts: 3,
    createdAt: "2026-07-30T08:00:00.000Z",
    updatedAt: "2026-07-30T08:00:00.000Z",
    resolvedAt: input.state === "resolved" ? "2026-07-30T08:01:00.000Z" : null,
  });
}

describe("ActionsScreen", () => {
  it("groups unresolved application and source actions and excludes terminal requests", () => {
    const { getAllByText, getByRole, getByText, queryByText } = render(
      <ActionsScreen
        discoveryJobs={[]}
        isPending={() => false}
        onCommand={vi.fn()}
        onNavigate={vi.fn()}
        requests={[
          createRequest({ id: "application", scope: "application" }),
          createRequest({ id: "source", scope: "discovery_source" }),
          createRequest({
            id: "resolved",
            scope: "application",
            state: "resolved",
          }),
        ]}
      />,
    );

    expect(getByRole("heading", { name: "Applications" })).toBeTruthy();
    expect(getByRole("heading", { name: "Job sources" })).toBeTruthy();
    expect(getByText("Finish application sign-in")).toBeTruthy();
    expect(getByText("Sign in to source")).toBeTruthy();
    expect(queryByText("resolved")).toBeNull();
    expect(
      getAllByText(
        /cannot authorize account creation or a final application submission/i,
      ),
    ).toHaveLength(2);
  });

  it("exposes keyboard-native Open, Done, Skip, and Cancel commands with hard safety fields", () => {
    const onCommand = vi.fn<(command: UserActionCommandInput) => void>();
    const request = createRequest({ id: "application", scope: "application" });
    const { getByRole } = render(
      <ActionsScreen
        discoveryJobs={[]}
        isPending={() => false}
        onCommand={onCommand}
        onNavigate={vi.fn()}
        requests={[request]}
      />,
    );

    for (const name of ["Open sign-in", "I'm signed in", "Skip", "Cancel"]) {
      const button = getByRole("button", { name: new RegExp(name, "i") });
      expect(button.getAttribute("tabindex")).not.toBe("-1");
      fireEvent.click(button);
    }

    expect(onCommand.mock.calls.map(([command]) => command.action)).toEqual([
      "open_page",
      "confirm_done",
      "skip",
      "cancel",
    ]);
    for (const [command] of onCommand.mock.calls) {
      expect(command).toMatchObject({
        credentialsPolicy: "browser_only",
        submitAuthorized: false,
        accountCreationAuthorized: false,
      });
    }
  });

  it("keeps a blocked action retryable until the bounded attempt cap", () => {
    const onCommand = vi.fn<(command: UserActionCommandInput) => void>();
    const { getByRole, rerender } = render(
      <ActionsScreen
        discoveryJobs={[]}
        isPending={() => false}
        onCommand={onCommand}
        onNavigate={vi.fn()}
        requests={[
          createRequest({
            id: "blocked",
            scope: "discovery_source",
            state: "still_blocked",
            attemptCount: 2,
          }),
        ]}
      />,
    );

    fireEvent.click(getByRole("button", { name: "I'm signed in" }));
    expect(onCommand).toHaveBeenCalledWith(
      expect.objectContaining({ action: "confirm_done" }),
    );

    rerender(
      <ActionsScreen
        discoveryJobs={[]}
        isPending={() => false}
        onCommand={onCommand}
        onNavigate={vi.fn()}
        requests={[
          createRequest({
            id: "blocked",
            scope: "discovery_source",
            state: "still_blocked",
            attemptCount: 3,
          }),
        ]}
      />,
    );

    expect(getByRole("button", { name: "Attempts exhausted" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(getByRole("status").textContent).toContain(
      "Automatic checks paused after 3 attempts",
    );
    expect(getByRole("button", { name: "Open sign-in" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(getByRole("button", { name: "Skip" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(getByRole("button", { name: "Cancel" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("explains that a pending browser action is bounded", () => {
    const { getByRole } = render(
      <ActionsScreen
        discoveryJobs={[]}
        isPending={() => true}
        onCommand={vi.fn()}
        onNavigate={vi.fn()}
        requests={[createRequest({ id: "pending", scope: "discovery_source" })]}
      />,
    );

    expect(getByRole("status").textContent).toContain(
      "This step is time-limited",
    );
  });
  it("shows verifying as a disabled non-success state", () => {
    const { getByRole } = render(
      <ActionsScreen
        discoveryJobs={[]}
        isPending={() => false}
        onCommand={vi.fn()}
        onNavigate={vi.fn()}
        requests={[
          createRequest({
            id: "verifying",
            scope: "application",
            state: "verifying",
          }),
        ]}
      />,
    );

    expect(getByRole("button", { name: "Verifying" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("offers a clear recovery route when the browser link is unavailable", () => {
    const onCommand = vi.fn<(command: UserActionCommandInput) => void>();
    const onNavigate = vi.fn();
    const { getByRole, getByText, queryByRole } = render(
      <ActionsScreen
        discoveryJobs={[]}
        isPending={() => false}
        onCommand={onCommand}
        onNavigate={onNavigate}
        requests={[
          createRequest({
            actionUrl: null,
            id: "missing-link",
            scope: "application",
          }),
        ]}
      />,
    );

    expect(queryByRole("button", { name: "Open sign-in" })).toBeNull();
    expect(getByText(/saved browser link is unavailable/i)).toBeTruthy();
    const recoveryButton = getByRole("button", {
      name: "Review application",
    });
    expect(recoveryButton.getAttribute("aria-describedby")).toContain(
      "missing-link-missing-browser-link",
    );
    fireEvent.click(recoveryButton);
    expect(onNavigate).toHaveBeenCalledWith("/job-finder/applications");
    expect(onCommand).not.toHaveBeenCalled();
  });
});
