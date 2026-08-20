// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageHeader } from "./page-header";

describe("PageHeader", () => {
  it("uses the responsive title scale for the standard page header", () => {
    render(
      <PageHeader
        description="Review the current workspace and decide what to do next."
        eyebrow="Job Finder"
        title="Find the right next opportunity"
      />,
    );

    const heading = screen.getByRole("heading", {
      name: "Find the right next opportunity",
    });

    expect(heading.className).toContain("text-(length:--text-page-title)");
    expect(heading.className).toContain("leading-[0.98]");
    expect(screen.getByText("Job Finder")).toBeTruthy();
    expect(
      screen.getByText(
        "Review the current workspace and decide what to do next.",
      ),
    ).toBeTruthy();
  });

  it("keeps compact headers readable without hiding their status text", () => {
    render(
      <PageHeader
        compact
        description="A shorter supporting explanation remains available."
        eyebrow="Profile"
        title="Resume strategy"
      />,
    );

    const heading = screen.getByRole("heading", { name: "Resume strategy" });

    expect(heading.className).toContain(
      "text-(length:--text-page-title-compact)",
    );
    expect(
      screen.getByText("A shorter supporting explanation remains available."),
    ).toBeTruthy();
  });
});
