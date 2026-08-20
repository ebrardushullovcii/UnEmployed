// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JobFinderGlobalSearch } from "./job-finder-global-search";

afterEach(cleanup);

describe("JobFinderGlobalSearch", () => {
  it("searches local metadata, groups results, and navigates through the owner callback", () => {
    const onNavigate = vi.fn();
    render(
      <JobFinderGlobalSearch
        entries={[
          {
            href: "/job-finder/discovery?job=one",
            id: "one",
            kind: "job",
            metadata: ["TypeScript", "remote"],
            subtitle: "Acme · Remote",
            title: "Platform Engineer",
          },
          {
            href: "/job-finder/settings?asset=resume",
            id: "resume",
            kind: "document",
            metadata: ["resume"],
            subtitle: "PDF",
            title: "Ebrar CV",
          },
        ]}
        onNavigate={onNavigate}
      />,
    );

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search Job Finder" }),
      { target: { value: "typescript" } },
    );
    expect(screen.getByText("1 result")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Platform Engineer/i }));
    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({
        href: "/job-finder/discovery?job=one",
        id: "one",
        kind: "job",
      }),
    );
  });

  it("does not search on one noisy character", () => {
    render(<JobFinderGlobalSearch entries={[]} onNavigate={vi.fn()} />);
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search Job Finder" }),
      { target: { value: "a" } },
    );
    expect(screen.queryByText(/local records match/i)).toBeNull();
  });

  it("wraps long result labels and exposes their complete names", () => {
    const longTitle = "ApplicationTitleWithoutAnyWordBreaksAtAll";
    const longSubtitle = "CompanyWithoutAnyWordBreaks · RemoteWithoutBreaks";
    render(
      <JobFinderGlobalSearch
        entries={[
          {
            href: "/job-finder/applications/one",
            id: "one",
            kind: "application",
            metadata: ["long"],
            subtitle: longSubtitle,
            title: longTitle,
          },
        ]}
        onNavigate={vi.fn()}
      />,
    );

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search Job Finder" }),
      { target: { value: "long" } },
    );
    const result = screen.getByRole("button", {
      name: /ApplicationTitleWithoutAnyWordBreaksAtAll/,
    });
    const title = result.querySelector("strong");
    const subtitle = result.querySelector("span");
    expect(result.className).toContain("min-w-0");
    expect(title?.className).toContain("break-words");
    expect(title?.getAttribute("title")).toBe(longTitle);
    expect(subtitle?.className).toContain("break-words");
    expect(subtitle?.getAttribute("title")).toBe(longSubtitle);
  });
});
