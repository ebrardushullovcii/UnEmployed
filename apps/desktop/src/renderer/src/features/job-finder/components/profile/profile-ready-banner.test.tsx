// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ProfileReadyBanner } from "./profile-ready-banner";

function renderReadyBanner(completionIdentity: string) {
  return render(
    <MemoryRouter>
      <ProfileReadyBanner completionIdentity={completionIdentity} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage?.clear();
});

describe("ProfileReadyBanner", () => {
  it("scopes completion copy to core setup instead of implying full-profile readiness", () => {
    renderReadyBanner("candidate_1:completion_1");

    expect(screen.getByText("Optional details can stay empty.")).toBeTruthy();
    expect(
      screen.queryByText(
        "Your profile setup is ready for job search. Continue to Find jobs to review matches from your configured sources.",
      ),
    ).toBeNull();
    expect(screen.getByText("Core setup is ready.")).toBeTruthy();
  });

  it("keeps the Find jobs continuation as a router-owned link", () => {
    renderReadyBanner("candidate_1:completion_1");

    expect(
      screen
        .getByRole("link", { name: "Continue to Find jobs" })
        .getAttribute("href"),
    ).toBe("/job-finder/discovery");
  });

  it("dismisses the ready message persistently", () => {
    const view = renderReadyBanner("candidate_1:completion_1");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Dismiss core setup ready message",
      }),
    );
    expect(screen.queryByText("Core setup is ready.")).toBeNull();

    view.unmount();
    renderReadyBanner("candidate_1:completion_1");
    expect(screen.queryByText("Core setup is ready.")).toBeNull();
  });

  it("shows the continuation again for a different profile completion", () => {
    const view = renderReadyBanner("candidate_1:completion_1");
    fireEvent.click(
      screen.getByRole("button", {
        name: "Dismiss core setup ready message",
      }),
    );

    view.rerender(
      <MemoryRouter>
        <ProfileReadyBanner completionIdentity="candidate_2:completion_2" />
      </MemoryRouter>,
    );

    expect(screen.getByText("Core setup is ready.")).toBeTruthy();
  });
});
