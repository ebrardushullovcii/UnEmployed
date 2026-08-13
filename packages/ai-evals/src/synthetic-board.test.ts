import { describe, expect, it } from "vitest";

import { buildSyntheticBoardHtml } from "./synthetic-board";

function board(fixtureKind: string, url = "https://jobs.example.com/jobs") {
  return buildSyntheticBoardHtml({
    title: "Fixture",
    summary: "Synthetic behavior",
    jobCount: 4,
    fixtureKind,
    url,
  });
}

describe("synthetic browser boards", () => {
  it("requires navigation for jobs-route and careers-route fixtures", () => {
    expect(board("jobs_route", "https://jobs.example.com/")).toContain(
      'href="/careers/jobs"',
    );
    expect(
      board("one_navigation", "https://jobs.example.com/careers"),
    ).toContain('href="/jobs"');
  });

  it("places useful work only on page two for pagination fixtures", () => {
    const first = board("pagination", "https://jobs.example.com/jobs?page=1");
    const second = board("pagination", "https://jobs.example.com/jobs?page=2");

    expect(first).toContain("Sales Manager");
    expect(first).not.toContain("Frontend Engineer");
    expect(second).toContain("Frontend Engineer");
    expect(second).not.toContain("Sales Manager");
  });

  it("models working, fake, cookie, login, and infinite-scroll behavior distinctly", () => {
    expect(board("working_filters")).toContain("Results updated");
    expect(board("fake_filters")).toContain("results unchanged");
    expect(board("cookie_overlay")).toContain("Cookie preferences");
    expect(board("login_redirect", "https://jobs.example.com/login")).toContain(
      "Sign in required",
    );
    expect(board("infinite_scroll")).toContain("insertAdjacentHTML");
  });

  it("creates duplicate tracking URLs only for route-drift fixtures", () => {
    const drift = board("route_drift");
    const normal = board("structured_jobs_page");

    expect(drift.match(/utm_source=/g)).toHaveLength(4);
    expect(normal).not.toContain("utm_source=");
  });
});
