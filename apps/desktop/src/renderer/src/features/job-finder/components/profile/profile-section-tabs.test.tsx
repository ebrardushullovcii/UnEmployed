// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProfileSectionTabs } from "./profile-section-tabs";

const sections = [
  {
    description: "Identity and profile basics",
    id: "basics" as const,
    label: "Basics",
    progress: { filled: 3, percent: 75, total: 4 },
  },
  {
    description: "Work history",
    id: "experience" as const,
    label: "Experience",
    progress: { filled: 2, percent: 50, total: 4 },
  },
];

const fiveSections = [
  ...sections,
  {
    description: "Background and education",
    id: "background" as const,
    label: "Background",
    progress: { filled: 1, percent: 25, total: 4 },
  },
  {
    description: "Search preferences",
    id: "preferences" as const,
    label: "Preferences",
    progress: { filled: 3, percent: 75, total: 4 },
  },
  {
    description: "Job sources",
    id: "sources" as const,
    label: "Sources",
    progress: { filled: 2, percent: 50, total: 4 },
  },
];

describe("ProfileSectionTabs", () => {
  it("makes the complete visible tab surface the click target", () => {
    const onSectionChange = vi.fn();

    render(
      <ProfileSectionTabs
        activeSection="basics"
        onSectionChange={onSectionChange}
        panelId="profile-section-panel"
        sections={sections}
      />,
    );

    const experienceTab = screen.getByRole("tab", { name: /experience/i });
    expect(experienceTab.className).toContain("h-full");
    expect(experienceTab.firstElementChild?.className).toContain(
      "pointer-events-none",
    );

    fireEvent.click(experienceTab);
    expect(onSectionChange).toHaveBeenCalledWith("experience");
  });

  it("carries no progress bar: the status label is the whole signal", () => {
    render(
      <ProfileSectionTabs
        activeSection="basics"
        onSectionChange={vi.fn()}
        panelId="profile-section-panel"
        sections={sections}
      />,
    );

    for (const tab of screen.getAllByRole("tab")) {
      const fills = Array.from(tab.querySelectorAll("span")).filter((span) =>
        span.className.startsWith("block h-full"),
      );
      expect(fills).toHaveLength(0);
      expect(tab.className).not.toContain("progress-active-start");
    }
  });

  it("shows a quiet required-field signal instead of a fraction and percent", () => {
    const { container } = render(
      <ProfileSectionTabs
        activeSection="basics"
        onSectionChange={vi.fn()}
        panelId="profile-section-panel"
        sections={[
          {
            description: "Identity and profile basics",
            id: "basics",
            label: "Basics",
            progress: {
              filled: 17,
              percent: 59,
              required: { filled: 6, total: 6 },
              total: 29,
            },
          },
          {
            description: "Search preferences",
            id: "preferences",
            label: "Preferences",
            progress: {
              filled: 4,
              percent: 12,
              required: { filled: 0, total: 2 },
              total: 33,
            },
          },
          {
            description: "Background and education",
            id: "background",
            label: "Background",
            progress: { filled: 0, percent: 0, total: 8 },
          },
        ]}
      />,
    );

    const tabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    expect(tabs[0]?.textContent).toContain("Required done");
    expect(tabs[0]?.textContent).not.toContain("17/29");
    expect(tabs[0]?.textContent).not.toContain("59%");
    // No unlabelled bar under the label to contradict it.
    expect(tabs[0]?.querySelector("span.block.h-full")).toBeNull();
    expect(tabs[1]?.querySelector("span.block.h-full")).toBeNull();
    expect(
      tabs[0]
        ?.querySelector("[data-profile-section-progress-state]")
        ?.getAttribute("data-profile-section-progress-state"),
    ).toBe("complete");
    expect(tabs[1]?.textContent).toContain("2 to fill");
    expect(tabs[2]?.textContent).toContain("Optional");
    // One line per cell, so a long label truncates instead of overflowing the
    // strip's own rule.
    expect(
      tabs.every((tab) => Boolean(tab.querySelector("span.truncate"))),
    ).toBe(true);
  });

  it("keeps five sections on one row from sm up, so a tab click changes what is on screen", () => {
    const { container } = render(
      <ProfileSectionTabs
        activeSection="basics"
        onSectionChange={vi.fn()}
        panelId="profile-section-panel"
        sections={fiveSections}
      />,
    );

    const tabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    expect(tabs).toHaveLength(5);
    const tablist = container.querySelector('[role="tablist"]');
    // Three stacked rows below 1280px pushed the selected section's content
    // off the first viewport at every supported compact height.
    expect(tablist?.className).toContain("grid-cols-2");
    expect(tablist?.className).toContain("sm:grid-cols-5");
    expect(tablist?.className).not.toContain("xl:grid-cols-5");
    expect(tabs[4]?.className).toContain("col-span-2");
    expect(tabs[4]?.className).toContain("sm:col-span-1");
    expect(
      tabs.slice(0, 4).every((tab) => !tab.className.includes("col-span-2")),
    ).toBe(true);
  });
});
