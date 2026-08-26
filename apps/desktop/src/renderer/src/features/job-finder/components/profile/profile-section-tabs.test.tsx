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

  it("uses one accent gradient for every section progress fill", () => {
    render(
      <ProfileSectionTabs
        activeSection="basics"
        onSectionChange={vi.fn()}
        panelId="profile-section-panel"
        sections={sections}
      />,
    );

    const activeGradient =
      "bg-[linear-gradient(90deg,var(--progress-active-start),var(--progress-active-end))]";
    for (const tab of screen.getAllByRole("tab")) {
      const fills = Array.from(tab.querySelectorAll("span")).filter((span) =>
        span.className.startsWith("block h-full"),
      );
      expect(fills).toHaveLength(1);
      expect(fills[0]?.className).toContain(activeGradient);
      expect(fills[0]?.className).not.toContain("--progress-warm-start");
    }
  });
});
