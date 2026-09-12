import { describe, expect, test } from "vitest";

import {
  toCandidateListValues,
  toNarrativeStringArray,
  toStringArray,
} from "./resume-import-common";

describe("resume import common helpers", () => {
  test("drops trailing comma punctuation when splitting list strings", () => {
    expect(toStringArray("foo,")).toEqual(["foo"]);
    expect(toStringArray(",")).toEqual([]);
  });

  test("preserves commas inside narrative achievement lines", () => {
    expect(
      toNarrativeStringArray([
        "Built a real-time order platform with React, Next.js, TailwindCSS, and WebSockets.",
        "Improved POS, kitchen, and delivery workflows by removing manual handoffs.",
      ]),
    ).toEqual([
      "Built a real-time order platform with React, Next.js, TailwindCSS, and WebSockets.",
      "Improved POS, kitchen, and delivery workflows by removing manual handoffs.",
    ]);
  });

  test("preserves commas inside scalar role and location candidates", () => {
    expect(
      toCandidateListValues({
        target: {
          section: "search_preferences",
          key: "locations",
          recordId: null,
        },
        value: "Portland, Oregon",
      }),
    ).toEqual(["Portland, Oregon"]);
    expect(
      toCandidateListValues({
        target: {
          section: "search_preferences",
          key: "targetRoles",
          recordId: null,
        },
        value: "Director, Product",
      }),
    ).toEqual(["Director, Product"]);
  });

  test("preserves commas inside array-backed location candidates", () => {
    expect(
      toCandidateListValues({
        target: {
          section: "search_preferences",
          key: "locations",
          recordId: null,
        },
        value: ["Portland, Oregon"],
      }),
    ).toEqual(["Portland, Oregon"]);
  });

  test("splits explicit narrative lines without keeping bullet markers", () => {
    expect(
      toNarrativeStringArray(
        "• Built the workflow dashboard.\n- Reduced triage time by 30%.",
      ),
    ).toEqual(["Built the workflow dashboard.", "Reduced triage time by 30%."]);
  });
});

describe("toNarrativeStringArray bullet splitting", () => {
  test("splits inline bullet glyphs and long multi-sentence blobs into separate entries", () => {
    expect(
      toNarrativeStringArray("Led the migration to Kubernetes. • Cut deploy time by 40%. • Mentored four engineers."),
    ).toEqual([
      "Led the migration to Kubernetes.",
      "Cut deploy time by 40%.",
      "Mentored four engineers.",
    ]);
    const blob =
      "Designed the claims pipeline that processes two million records a night without manual intervention. " +
      "Replaced a legacy batch job with streaming services and cut end-to-end latency from hours to minutes for every downstream team. " +
      "Wrote the on-call runbooks that the whole platform group now follows during incidents. " +
      "Coached two junior engineers through their first production launches.";
    expect(toNarrativeStringArray(blob)).toHaveLength(4);
    expect(toNarrativeStringArray("Short single bullet.")).toEqual(["Short single bullet."]);
  });
});
