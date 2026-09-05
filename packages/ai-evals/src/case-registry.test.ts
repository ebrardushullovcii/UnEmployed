import { describe, expect, test } from "vitest";

import { createFrozenEvalCases, digestEvalCorpus } from "./case-registry";
import { evalCapabilityValues } from "./contracts";
import { findEvalPrivacyViolations } from "./privacy";

describe("AI evaluation corpus", () => {
  test("contains exactly ten synthetic cases for every model-backed capability", () => {
    const cases = createFrozenEvalCases();

    expect(cases).toHaveLength(evalCapabilityValues.length * 10);
    for (const capability of evalCapabilityValues) {
      expect(
        cases.filter((entry) => entry.capability === capability),
      ).toHaveLength(10);
    }
    expect(new Set(cases.map((entry) => entry.id)).size).toBe(cases.length);
  });

  test("passes the personal-data and real-workspace denylist", () => {
    const cases = createFrozenEvalCases();

    expect(cases.flatMap(findEvalPrivacyViolations)).toEqual([]);
    expect(cases.every((entry) => entry.privacy === "synthetic")).toBe(true);
  });

  test("produces a stable corpus digest", () => {
    const cases = createFrozenEvalCases();

    expect(digestEvalCorpus(cases)).toMatch(/^[a-f0-9]{64}$/);
    expect(digestEvalCorpus(cases)).toBe(
      digestEvalCorpus(createFrozenEvalCases()),
    );
  });
});
