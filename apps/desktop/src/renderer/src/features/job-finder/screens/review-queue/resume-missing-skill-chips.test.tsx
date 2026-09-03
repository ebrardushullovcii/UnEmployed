// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResumeMissingSkillChips } from "./resume-missing-skill-chips";

afterEach(() => {
  cleanup();
});

describe("ResumeMissingSkillChips", () => {
  it("renders nothing when the tailored draft kept every skill", () => {
    const { container } = render(
      <ResumeMissingSkillChips
        disabled={false}
        onAddSkill={vi.fn()}
        skills={[]}
      />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("makes each dropped skill a one-click add instead of a grey paragraph", () => {
    const onAddSkill = vi.fn();

    render(
      <ResumeMissingSkillChips
        disabled={false}
        onAddSkill={onAddSkill}
        skills={["Azure", "Docker", "Kubernetes"]}
      />,
    );

    expect(screen.getByText("3 skills are not on the page")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Add Docker to this section" }),
    );

    expect(onAddSkill).toHaveBeenCalledTimes(1);
    expect(onAddSkill).toHaveBeenCalledWith("Docker");
  });

  it("counts a single dropped skill in the singular", () => {
    render(
      <ResumeMissingSkillChips
        disabled={false}
        onAddSkill={vi.fn()}
        skills={["Terraform"]}
      />,
    );

    expect(screen.getByText("1 skill is not on the page")).toBeTruthy();
  });

  it("disables every chip while the workspace is saving", () => {
    render(
      <ResumeMissingSkillChips
        disabled
        onAddSkill={vi.fn()}
        skills={["Redis", "SQL"]}
      />,
    );

    for (const chip of screen.getAllByRole("button")) {
      expect(chip).toHaveProperty("disabled", true);
    }
  });
});
