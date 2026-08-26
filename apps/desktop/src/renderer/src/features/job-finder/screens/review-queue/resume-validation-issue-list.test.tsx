// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResumeValidationIssue } from "@unemployed/contracts";
import {
  countBlockingResumeValidationIssues,
  getResumeValidationIssueTargetId,
  orderResumeValidationIssues,
  ResumeValidationIssueList,
} from "./resume-validation-issue-list";

const errorIssue: ResumeValidationIssue = {
  id: "issue_error",
  severity: "error",
  category: "invented_metric",
  sectionId: "section_experience",
  entryId: "entry_1",
  bulletId: null,
  message: "Metric not grounded in evidence.",
};

const warningIssue: ResumeValidationIssue = {
  id: "issue_warning",
  severity: "warning",
  category: "thin_output",
  sectionId: null,
  entryId: null,
  bulletId: null,
  message: "Output reads thin.",
};

describe("resume validation issue helpers", () => {
  it("orders errors ahead of warnings and info without losing input order", () => {
    const infoIssue: ResumeValidationIssue = {
      ...warningIssue,
      id: "issue_info",
      severity: "info",
    };
    const ordered = orderResumeValidationIssues([
      warningIssue,
      infoIssue,
      errorIssue,
    ]);

    expect(ordered.map((issue) => issue.id)).toEqual([
      "issue_error",
      "issue_warning",
      "issue_info",
    ]);
  });

  it("maps issues onto exact editor targets and skips untargetable rows", () => {
    expect(
      getResumeValidationIssueTargetId({
        sectionId: "section_experience",
        entryId: "entry_1",
        bulletId: "bullet_9",
      }),
    ).toBe("entry:section_experience:entry_1:bullet:bullet_9");
    expect(
      getResumeValidationIssueTargetId({
        sectionId: "section_summary",
        entryId: null,
        bulletId: "bullet_2",
      }),
    ).toBe("section:section_summary:bullet:bullet_2");
    expect(getResumeValidationIssueTargetId(errorIssue)).toBe(
      "entry:section_experience:entry_1:summary",
    );
    expect(
      getResumeValidationIssueTargetId({
        sectionId: "section_skills",
        entryId: null,
        bulletId: null,
      }),
    ).toBe("section:section_skills:text");
    expect(getResumeValidationIssueTargetId(warningIssue)).toBeNull();
    expect(
      countBlockingResumeValidationIssues([errorIssue, warningIssue]),
    ).toBe(1);
  });
});

describe("ResumeValidationIssueList", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders nothing without issues and names blockers when present", () => {
    const { container: emptyContainer } = render(
      <ResumeValidationIssueList issues={[]} onFixIssue={vi.fn()} />,
    );
    expect(emptyContainer.querySelector("section")).toBeNull();

    render(
      <ResumeValidationIssueList
        issues={[errorIssue, warningIssue]}
        onFixIssue={vi.fn()}
      />,
    );

    expect(screen.getByText("Blocks approval")).toBeTruthy();
    expect(screen.getByText("1 approval blocker")).toBeTruthy();
    expect(screen.getByText("Metric not grounded in evidence.")).toBeTruthy();
    expect(
      document.querySelectorAll("[data-resume-validation-issue]"),
    ).toHaveLength(2);
  });

  it("sends the affected issue to the fix handler", () => {
    const onFixIssue = vi.fn();
    render(
      <ResumeValidationIssueList
        issues={[errorIssue, warningIssue]}
        onFixIssue={onFixIssue}
      />,
    );

    const fixButtons = screen.getAllByRole("button", { name: "Fix in editor" });
    expect(fixButtons).toHaveLength(1);
    fireEvent.click(fixButtons[0]!);

    expect(onFixIssue).toHaveBeenCalledWith(errorIssue);
  });
});
