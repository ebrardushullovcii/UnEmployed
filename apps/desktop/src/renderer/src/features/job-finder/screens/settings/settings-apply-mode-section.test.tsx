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
      mode="prepare_only"
      onSave={onSave}
      {...props}
    />,
  );
  return { onSave };
}

describe("SettingsApplyModeSection", () => {
  it("shows the three useful application modes and the daily cap", () => {
    renderSection();

    expect(screen.getByRole("radio", { name: /Prepare for me/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Ask before sending/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Send for me/ })).toBeTruthy();
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

    fireEvent.click(screen.getByRole("radio", { name: /Ask before sending/ }));
    fireEvent.change(screen.getByLabelText("Most applications in one day"), {
      target: { value: "8" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({
      mode: "confirm_before_submit",
      maxApplicationsPerLocalDay: 8,
    });
    expect(screen.getAllByRole("button", { name: "Save" })).toHaveLength(1);
  });

  it("shows the saved send-for-me mode selected", () => {
    renderSection({ mode: "autonomous_submit" });

    expect(
      screen
        .getByRole("radio", { name: /Send for me/ })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });
});
