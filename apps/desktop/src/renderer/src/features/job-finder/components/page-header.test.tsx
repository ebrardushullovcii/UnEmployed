// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageHeader, PageHeaderStack, PageSubnav } from "./page-header";

describe("PageHeader", () => {
  it("renders the ordinary anatomy: title, description, and optional actions", () => {
    const view = render(
      <PageHeader
        actions={<button type="button">New search plan</button>}
        description="Organize roles, sources, volume, safeguards, and progress into reusable plans."
        title="Search plans"
      />,
    );

    expect(screen.getByRole("heading", { name: "Search plans" })).toBeTruthy();
    expect(
      screen.getByText(
        "Organize roles, sources, volume, safeguards, and progress into reusable plans.",
      ),
    ).toBeTruthy();

    const header = view.container.querySelector("[data-page-header]");
    const actions = view.container.querySelector("[data-page-header-actions]");
    expect(actions).toBeTruthy();
    expect(header?.contains(actions as Node)).toBe(true);
    expect(
      screen.getByRole("button", { name: "New search plan" }),
    ).toBeTruthy();
  });

  it("omits the actions region when no actions are given", () => {
    render(<PageHeader description="Plain page." title="Outcomes" />);

    expect(screen.getByRole("heading", { name: "Outcomes" })).toBeTruthy();
  });

  it("keeps legacy eyebrow props inert so no visible eyebrow renders", () => {
    const view = render(
      <PageHeader
        description="Review the current workspace."
        eyebrow="Job Finder"
        title="Find jobs"
      />,
    );

    expect(view.container.querySelector("[data-page-eyebrow]")).toBeNull();
    expect(screen.queryByText("Job Finder")).toBeNull();
    expect(screen.getByRole("heading", { name: "Find jobs" })).toBeTruthy();
  });

  it("wraps long titles and descriptions instead of clipping them", () => {
    const view = render(
      <PageHeader
        description="A very long supporting sentence that must stay readable at 200% text scale without horizontal scrolling anywhere on the page."
        title="Needs you"
      />,
    );

    const heading = screen.getByRole("heading", { name: "Needs you" });
    expect(heading.className).not.toMatch(/truncate|nowrap|overflow-hidden/u);
    const description = screen.getByText(/A very long supporting sentence/u);
    expect(description.className).toContain("max-w-[68ch]");
    expect(view.container.textContent).toContain("Needs you");
  });
});

describe("PageHeaderStack", () => {
  it("owns exactly one bottom divider and the shared body seam", () => {
    const view = render(
      <PageHeaderStack
        description="Search your sources and review the strongest matches."
        title="Find jobs"
      />,
    );

    const stack = view.container.querySelector("[data-page-header-stack]");
    const dividers = view.container.querySelectorAll(
      "[data-page-header-divider]",
    );
    expect(dividers).toHaveLength(1);

    const header = Array.from(stack?.children ?? []).find((child) =>
      child.hasAttribute("data-page-header"),
    );
    expect(header).toBeTruthy();
    expect(header?.className).not.toContain("border-b");
    expect(stack?.className).toContain("mb-(--gap-page-header-body)");
    expect(dividers[0]?.className).toContain("border-b");
  });

  it("places an auxiliary subnav 8px below the title block above the divider", () => {
    const view = render(
      <PageHeaderStack
        description="Review progress, resolve blockers, and continue applications."
        subnav={
          <div role="group" aria-label="Applications workspace view">
            modes
          </div>
        }
        title="Applications"
      />,
    );

    const stack = view.container.querySelector("[data-page-header-stack]");
    const subnav = view.container.querySelector("[data-page-header-subnav]");
    const divider = view.container.querySelector("[data-page-header-divider]");

    expect(subnav?.className).toContain("mt-(--gap-page-header-aux)");
    expect(subnav?.textContent).toBe("modes");
    expect(divider?.className).toContain("mt-(--gap-page-header-aux)");
    expect(
      screen.getByRole("group", { name: "Applications workspace view" }),
    ).toBeTruthy();
    expect(stack?.className).toContain("mb-(--gap-page-header-body)");
  });

  it("tolerates deprecated header props without changing the stack", () => {
    const view = render(
      <PageHeaderStack
        compact
        description="Short supporting explanation."
        eyebrow="Profile"
        title="Resume strategy"
      />,
    );

    expect(
      view.container.querySelectorAll("[data-page-header-divider]"),
    ).toHaveLength(1);
    expect(screen.queryByText("Profile")).toBeNull();
  });
});

describe("PageSubnav", () => {
  it("is a layout-only row that forwards semantics to its children", () => {
    const view = render(
      <PageSubnav
        aria-label="Find jobs workspace"
        className="w-fit gap-1 rounded-(--radius-field) border border-(--surface-panel-border) p-1"
        role="group"
      >
        <button aria-pressed type="button">
          Results
        </button>
        <button aria-pressed={false} type="button">
          Search setup
        </button>
      </PageSubnav>,
    );

    const subnav = view.container.querySelector("[data-page-subnav]");
    expect(subnav?.tagName).toBe("DIV");
    expect(subnav?.className).toContain("flex-wrap");
    expect(subnav?.className).toContain("rounded-(--radius-field)");
    expect(
      screen.getByRole("group", { name: "Find jobs workspace" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Results" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Search setup" })).toBeTruthy();
  });
});
