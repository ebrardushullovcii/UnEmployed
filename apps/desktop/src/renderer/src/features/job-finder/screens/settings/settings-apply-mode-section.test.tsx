// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsApplyModeSection } from "./settings-apply-mode-section";

afterEach(cleanup);

function renderSection(
  props: Partial<Parameters<typeof SettingsApplyModeSection>[0]> = {},
) {
  const onSave = vi.fn();
  render(
    <SettingsApplyModeSection
      maxApplicationsPerLocalDay={20}
      mode="fill_only"
      onSave={onSave}
      {...props}
    />,
  );
  return { onSave };
}

describe("SettingsApplyModeSection", () => {
  it("is one switch, two lines, and the daily cap", () => {
    renderSection();

    expect(
      screen.getByRole("switch", {
        name: /Let Job Finder send applications for me/,
      }),
    ).toBeTruthy();
    const explanations = screen.getByTestId("apply-mode-explanations");
    expect(explanations.textContent).toContain(
      "Job Finder fills the form and leaves the browser open; you click Apply.",
    );
    expect(explanations.textContent).toContain(
      "Job Finder fills and sends; it stops for anything it cannot answer honestly.",
    );
    expect(
      screen.getByLabelText("Most applications in one day"),
    ).toBeTruthy();

    // Nothing about envelopes, approvals, revoking, websites, or reusable
    // answers survives on this screen (ADR 0022).
    expect(document.body.textContent ?? "").not.toMatch(
      /envelope|approval|approve|revoke|website|reusable answer|fingerprint|snapshot/i,
    );
  });

  it("saves the chosen mode and cap behind one Save button", () => {
    const { onSave } = renderSection();

    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toHaveProperty("disabled", true);

    fireEvent.click(
      screen.getByRole("switch", {
        name: /Let Job Finder send applications for me/,
      }),
    );
    fireEvent.change(screen.getByLabelText("Most applications in one day"), {
      target: { value: "8" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({
      mode: "apply_for_me",
      maxApplicationsPerLocalDay: 8,
    });
    expect(screen.getAllByRole("button", { name: "Save" })).toHaveLength(1);
  });

  it("shows the switch already on for a workspace that sends applications", () => {
    renderSection({ mode: "apply_for_me" });

    expect(
      screen
        .getByRole("switch", {
          name: /Let Job Finder send applications for me/,
        })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });
});
