import { describe, expect, test } from "vitest";

import {
  matchesAnyPhrase,
  matchesLocationPreference,
  matchesTitlePreference,
} from "./matching";

describe("matching helpers", () => {
  test("keeps the generic phrase matcher strict for whole-token matches", () => {
    expect(matchesAnyPhrase("Senior Java Engineer", ["java"])).toBe(true);
    expect(matchesAnyPhrase("Senior JavaScript Engineer", ["java"])).toBe(false);
  });

  test("matches common full-stack role variants for discovery triage", () => {
    expect(
      matchesTitlePreference("Senior Full Stack Engineer (Typescript)", [
        "Senior Full-Stack Software Engineer",
      ]),
    ).toBe(true);
    expect(
      matchesTitlePreference("Full Stack Developer (AI-First)", [
        "Senior Full-Stack Software Engineer",
      ]),
    ).toBe(true);
    expect(
      matchesTitlePreference("Senior Frontend Engineer", [
        "Senior Full-Stack Software Engineer",
      ]),
    ).toBe(false);
  });

  test("matches linkedin noisy dismiss-title strings without letting adjacent frontend roles through", () => {
    expect(
      matchesTitlePreference(
        "Full Circle Agency • Pristina (Remote) Dismiss Full Stack Developer (AI-First) job Viewed · Posted 1 month ago",
        ["Senior Full-Stack Software Engineer"],
      ),
    ).toBe(true);
    expect(
      matchesTitlePreference(
        "Senior Full Stack Engineer (Typescript) (Verified job) Fresha • Pristina (On-site) Dismiss Senior Full Stack Engineer (Typescript) job 1 connection works here Viewed · Promoted",
        ["Senior Full-Stack Software Engineer"],
      ),
    ).toBe(true);
    expect(
      matchesTitlePreference(
        "Senior Frontend Engineer (Verified job) Fresha • Pristina (On-site) Dismiss Senior Frontend Engineer job 1 connection works here Viewed · Promoted",
        ["Senior Full-Stack Software Engineer"],
      ),
    ).toBe(false);
  });

  test("matches close location variants while ignoring work-mode noise", () => {
    expect(
      matchesLocationPreference("Pristina (On-site)", ["Prishtina, Kosovo"]),
    ).toBe(true);
    expect(matchesLocationPreference("Remote", ["Prishtina, Kosovo"])).toBe(true);
    expect(
      matchesLocationPreference("Prishtina, Kosovo (Remote)", [
        "Prishtina, Kosovo",
      ]),
    ).toBe(true);
    expect(matchesLocationPreference("Tirana, Albania", ["Prishtina, Kosovo"])).toBe(
      false,
    );
  });
});
