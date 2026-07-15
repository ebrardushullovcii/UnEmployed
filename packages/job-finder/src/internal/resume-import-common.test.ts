import { describe, expect, test } from "vitest";

import { toNarrativeStringArray, toStringArray } from "./resume-import-common";

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

  test("splits explicit narrative lines without keeping bullet markers", () => {
    expect(toNarrativeStringArray("• Built the workflow dashboard.\n- Reduced triage time by 30%.")).toEqual([
      "Built the workflow dashboard.",
      "Reduced triage time by 30%.",
    ]);
  });
});
