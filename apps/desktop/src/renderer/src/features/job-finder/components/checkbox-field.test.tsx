// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckboxField } from "./checkbox-field";

afterEach(cleanup);

describe("CheckboxField accessible name", () => {
  it("names the checkbox control with its visible label", () => {
    // Guided setup Job targets renders Remote/Hybrid/Onsite through this one
    // component. Before this, the Radix `button[role="checkbox"]` carried only
    // sibling text, so the control was announced unnamed and could not be
    // reached by its label.
    render(
      <>
        <CheckboxField
          checked={false}
          label="Remote"
          onCheckedChange={() => undefined}
        />
        <CheckboxField
          checked
          label="Hybrid"
          onCheckedChange={() => undefined}
        />
        <CheckboxField
          checked={false}
          label="Onsite"
          onCheckedChange={() => undefined}
        />
      </>,
    );

    for (const label of ["Remote", "Hybrid", "Onsite"]) {
      expect(screen.getByRole("checkbox", { name: label })).toBeTruthy();
    }

    expect(
      screen
        .getByRole("checkbox", { name: "Hybrid" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen
        .getByRole("checkbox", { name: "Remote" })
        .getAttribute("aria-checked"),
    ).toBe("false");
  });

  it("gives every instance its own label association", () => {
    render(
      <>
        <CheckboxField
          checked={false}
          label="Remote"
          onCheckedChange={() => undefined}
        />
        <CheckboxField
          checked={false}
          label="Remote"
          onCheckedChange={() => undefined}
        />
      </>,
    );

    const [first, second] = screen.getAllByRole("checkbox", {
      name: "Remote",
    });
    expect(first?.getAttribute("aria-labelledby")).toBeTruthy();
    expect(second?.getAttribute("aria-labelledby")).toBeTruthy();
    expect(first?.getAttribute("aria-labelledby")).not.toBe(
      second?.getAttribute("aria-labelledby"),
    );
  });

  it("keeps an explicit input id as the label association owner", () => {
    render(
      <CheckboxField
        checked={false}
        inputId="profile-work-mode-remote"
        label="Remote"
        onCheckedChange={() => undefined}
      />,
    );

    const control = screen.getByRole("checkbox", { name: "Remote" });
    expect(control.getAttribute("id")).toBe("profile-work-mode-remote");
    expect(control.getAttribute("aria-labelledby")).toBe(
      "profile-work-mode-remote-checkbox-field-label",
    );
  });

  it("reports the toggle through the named control", () => {
    const onCheckedChange = vi.fn();
    render(
      <CheckboxField
        checked={false}
        label="Remote"
        onCheckedChange={onCheckedChange}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Remote" }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});
