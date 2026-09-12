import { describe, expect, test } from "vitest";
import { filterCandidateFacingResumeKeywords } from "./resume-skill-grounding";

describe("filterCandidateFacingResumeKeywords", () => {
  test("drops schema enums and employment-type tokens that no resume should echo", () => {
    expect(
      filterCandidateFacingResumeKeywords([
        "FULL_TIME",
        "PART_TIME",
        "ON_SITE",
        "Full-time",
        "Remote",
        "React",
        "TypeScript",
        "PostgreSQL",
      ]),
    ).toEqual(["React", "TypeScript", "PostgreSQL"]);
  });

  test("keeps real technologies that happen to be capitalised", () => {
    expect(
      filterCandidateFacingResumeKeywords(["AWS", "SQL", "CI/CD", "GraphQL"]),
    ).toEqual(["AWS", "SQL", "CI/CD", "GraphQL"]);
  });
});
