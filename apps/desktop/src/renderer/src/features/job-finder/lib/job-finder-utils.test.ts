// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { jobDescriptionToText } from "./job-description-text";
import {
  getDefaultProfileRoute,
  getPostedDateLabel,
  parseListInput,
  parseTokenListInput,
} from "./job-finder-utils";

describe("getDefaultProfileRoute", () => {
  test("routes fresh workspaces to guided setup by default", () => {
    expect(
      getDefaultProfileRoute({
        status: "not_started",
        currentStep: "import",
        completedAt: null,
        reviewItems: [],
        lastResumedAt: null,
      }),
    ).toBe("/job-finder/profile/setup");
  });

  test("allows explicitly opening the full profile during fresh setup", () => {
    expect(
      getDefaultProfileRoute(
        {
          status: "not_started",
          currentStep: "import",
          completedAt: null,
          reviewItems: [],
          lastResumedAt: null,
        },
        { forceFullProfile: true },
      ),
    ).toBe("/job-finder/profile");
  });

  test("keeps in-progress and completed setup on the full profile route", () => {
    expect(
      getDefaultProfileRoute({
        status: "in_progress",
        currentStep: "background",
        completedAt: null,
        reviewItems: [],
        lastResumedAt: null,
      }),
    ).toBe("/job-finder/profile");

    expect(
      getDefaultProfileRoute({
        status: "completed",
        currentStep: "ready_check",
        completedAt: "2026-04-15T00:00:00.000Z",
        reviewItems: [],
        lastResumedAt: "2026-04-15T00:00:00.000Z",
      }),
    ).toBe("/job-finder/profile");
  });
});

describe("jobDescriptionToText", () => {
  test("strips encoded html markup from stored job descriptions", () => {
    expect(
      jobDescriptionToText(
        '&lt;div class="content-intro"&gt;&lt;h2&gt;&lt;strong&gt;About Remote&lt;/strong&gt;&lt;/h2&gt;&lt;div&gt;Remote is solving modern organizations&apos; biggest challenge.&lt;/div&gt;&lt;/div&gt;',
      ),
    ).toBe(
      "About Remote Remote is solving modern organizations' biggest challenge.",
    );
  });
});

describe("getPostedDateLabel", () => {
  const providerUpdatedAt = "2026-07-30T12:00:00.000Z";

  test("labels a known posting date as Posted", () => {
    expect(
      getPostedDateLabel({
        postedAt: "2026-07-01T12:00:00.000Z",
        postedAtText: null,
        providerUpdatedAt,
      }),
    ).toEqual({ label: "Posted", value: "01 Jul 2026" });
  });

  test("prefers the visible posted label over derived dates", () => {
    expect(
      getPostedDateLabel({
        postedAt: "2026-07-01T12:00:00.000Z",
        postedAtText: "2 days ago",
        providerUpdatedAt,
      }),
    ).toEqual({ label: "Posted", value: "2 days ago" });
  });

  test("labels a provider-only update time as Updated instead of claiming a posted date", () => {
    expect(
      getPostedDateLabel({
        postedAt: null,
        postedAtText: null,
        providerUpdatedAt,
      }),
    ).toEqual({ label: "Updated", value: "30 Jul 2026" });
  });

  test("falls back to an Unknown updated value when no provider timestamp exists", () => {
    expect(
      getPostedDateLabel({
        postedAt: null,
        postedAtText: null,
        providerUpdatedAt: null,
      }),
    ).toEqual({ label: "Updated", value: "Unknown" });
  });
});

describe("list input parsers", () => {
  test("keeps parseListInput strictly line-based for newline list fields", () => {
    expect(parseListInput("React\nTypeScript")).toEqual([
      "React",
      "TypeScript",
    ]);
    // A comma inside one line stays part of that line: this parser never
    // invents token boundaries.
    expect(parseListInput("frontend, fullstack")).toEqual([
      "frontend, fullstack",
    ]);
  });

  test("treats nullish watch values as empty lists instead of throwing", () => {
    expect(parseListInput(undefined)).toEqual([]);
    expect(parseListInput(null)).toEqual([]);
    expect(parseListInput("")).toEqual([]);
  });

  test("parses role-family tokens from commas and newlines together", () => {
    expect(parseTokenListInput("frontend, fullstack\ndesign systems")).toEqual([
      "frontend",
      "fullstack",
      "design systems",
    ]);
    expect(parseTokenListInput("backend,platform ,")).toEqual([
      "backend",
      "platform",
    ]);
    expect(parseTokenListInput("")).toEqual([]);
  });
});
