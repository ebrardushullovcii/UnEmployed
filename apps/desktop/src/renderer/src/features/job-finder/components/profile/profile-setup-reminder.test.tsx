// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProfileSetupReminder } from "./profile-setup-reminder";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe("ProfileSetupReminder", () => {
  it("resumes guided setup from the current step", () => {
    const onResume = vi.fn();

    render(
      <ProfileSetupReminder
        currentStep="essentials"
        isResumePending={false}
        onResume={onResume}
        pendingItemCount={16}
      />,
    );

    expect(
      screen.getByText(
        "16 setup items still need review. Continue from your basics.",
      ),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Resume guided setup" }),
    );

    expect(onResume).toHaveBeenCalledWith("essentials");
  });

  it("dismisses the reminder for the rest of the session", () => {
    const props = {
      currentStep: "essentials" as const,
      isResumePending: false,
      onResume: vi.fn(),
      pendingItemCount: 16,
    };
    const view = render(<ProfileSetupReminder {...props} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Dismiss guided setup reminder for this session",
      }),
    );

    expect(screen.queryByText("Setup still in progress")).toBeNull();

    view.unmount();
    render(<ProfileSetupReminder {...props} />);

    expect(screen.queryByText("Setup still in progress")).toBeNull();
  });

  it("renders dismissal as a quiet secondary action", () => {
    render(
      <ProfileSetupReminder
        currentStep="essentials"
        isResumePending={false}
        onResume={vi.fn()}
        pendingItemCount={16}
      />,
    );

    const dismissButton = screen.getByRole("button", {
      name: "Dismiss guided setup reminder for this session",
    });

    expect(dismissButton.getAttribute("data-size")).toBe("sm");
    expect(dismissButton.className).toContain("normal-case");
    expect(dismissButton.className).toContain("font-medium");
  });
});
