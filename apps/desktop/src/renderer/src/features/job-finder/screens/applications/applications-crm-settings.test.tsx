// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApplicationCrmSettings } from "@unemployed/contracts";

import { ApplicationsCrmSettingsEditor } from "./applications-crm-settings";

const canonicalFieldTokens = [
  "border-(--field-border)",
  "bg-(--field)",
  "outline-none",
  "focus-visible:border-(--field-focus-border)",
  "focus-visible:bg-(--field-strong)",
  "focus-visible:shadow-[var(--field-focus-shadow)]",
];

function expectCanonicalFieldClasses(control: HTMLElement) {
  for (const token of canonicalFieldTokens) {
    expect(control.className).toContain(token);
  }
  expect(control.className).not.toContain("border-input");
  expect(control.className).not.toContain("bg-background");
  expect(control.className).not.toContain("ring-[3px]");
}

describe("ApplicationsCrmSettingsEditor", () => {
  afterEach(cleanup);

  it("saves the follow-up rule and editable custom stage order", async () => {
    const onSave = vi
      .fn<(settings: ApplicationCrmSettings) => Promise<void>>()
      .mockResolvedValue(undefined);
    render(
      <ApplicationsCrmSettingsEditor
        onSave={onSave}
        settings={{
          noResponseAutomation: { enabled: true, afterDays: 14 },
          customStages: [
            {
              id: "custom_screening",
              label: "Screening call",
              baseStage: "recruiter_contact",
              color: "cyan",
              position: 0,
              isTerminal: false,
            },
            {
              id: "custom_reference",
              label: "Reference check",
              baseStage: "interview",
              color: "violet",
              position: 1,
              isTerminal: false,
            },
          ],
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText("After days"), {
      target: { value: "21" },
    });
    fireEvent.change(screen.getByDisplayValue("Screening call"), {
      target: { value: "Recruiter screen" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Move Reference check up" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Reference check" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add stage" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Save tracker settings" }),
    );

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0]?.[0];
    expect(saved).toBeDefined();
    if (!saved) throw new Error("Expected saved settings.");
    expect(saved.noResponseAutomation).toEqual({
      enabled: true,
      afterDays: 21,
    });
    expect(saved.customStages).toHaveLength(2);
    expect(saved.customStages[0]).toMatchObject({
      id: "custom_screening",
      label: "Recruiter screen",
      position: 0,
    });
    expect(saved.customStages[1]).toMatchObject({
      label: "New stage",
      position: 1,
      baseStage: "reviewing",
    });
  });

  it("keeps tracker settings rows shrinkable before the desktop breakpoint", () => {
    render(
      <ApplicationsCrmSettingsEditor
        onSave={vi.fn<(settings: ApplicationCrmSettings) => Promise<void>>()}
        settings={{
          noResponseAutomation: { enabled: true, afterDays: 14 },
          customStages: [
            {
              id: "custom_screening",
              label: "Screening call",
              baseStage: "recruiter_contact",
              color: "cyan",
              position: 0,
              isTerminal: false,
            },
          ],
        }}
      />,
    );

    expect(document.querySelector("form")?.className).toContain("min-w-0");
    expect(screen.getByRole("list").className).toContain("min-w-0");
    expect(screen.getByDisplayValue("Screening call").className).toContain(
      "min-w-0",
    );
  });

  it("applies the canonical field recipe to editable controls and leaves checkboxes and hidden inputs untouched", () => {
    render(
      <ApplicationsCrmSettingsEditor
        onSave={vi.fn<(settings: ApplicationCrmSettings) => Promise<void>>()}
        settings={{
          noResponseAutomation: { enabled: true, afterDays: 14 },
          customStages: [
            {
              id: "custom_screening",
              label: "Screening call",
              baseStage: "recruiter_contact",
              color: "cyan",
              position: 0,
              isTerminal: false,
            },
          ],
        }}
      />,
    );

    const editableControls = [
      screen.getByLabelText("After days"),
      screen.getByDisplayValue("Screening call"),
      screen.getByLabelText("Reports as"),
      screen.getByLabelText("Color"),
    ];
    for (const control of editableControls) {
      expectCanonicalFieldClasses(control);
    }

    // Protected native controls: checkbox styling stays untouched and hidden
    // RHF registrations carry no field classes.
    const checkboxes = [
      ...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ];
    const hiddenInputs = [
      ...document.querySelectorAll<HTMLInputElement>('input[type="hidden"]'),
    ];
    expect(checkboxes).toHaveLength(2);
    expect(hiddenInputs.length).toBeGreaterThan(0);
    for (const control of [...checkboxes, ...hiddenInputs]) {
      expect(control.className).toBe("");
    }
  });
});
