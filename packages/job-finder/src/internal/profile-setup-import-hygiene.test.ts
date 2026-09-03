import { describe, expect, it } from "vitest";

import {
  isSearchLocationCandidateTarget,
  sanitizeSearchLocationCandidateValue,
} from "./profile-setup-location-suggestions";
import {
  isNamedTechnologyStrength,
  partitionStrengthsAndSkills,
} from "./profile-setup-strengths-partition";

describe("imported preferred-location hygiene", () => {
  it("only treats the search-preferences location field as a job location", () => {
    expect(
      isSearchLocationCandidateTarget({
        section: "search_preferences",
        key: "locations",
      }),
    ).toBe(true);
    expect(
      isSearchLocationCandidateTarget({
        section: "location",
        key: "currentLocation",
      }),
    ).toBe(false);
  });

  it("drops the postal code a job-search location never carries", () => {
    expect(sanitizeSearchLocationCandidateValue("Cedar Park, TX 78613")).toBe(
      "Cedar Park, TX",
    );
    expect(
      sanitizeSearchLocationCandidateValue(["Austin, TX 78701", "Remote"]),
    ).toEqual(["Austin, TX", "Remote"]);
  });

  it("never empties a value or rewrites something that is not a postal code", () => {
    // Only a postal code is dropped, and only when other location text
    // survives; nothing is invented and nothing becomes empty.
    expect(sanitizeSearchLocationCandidateValue("78613")).toBe("78613");
    expect(sanitizeSearchLocationCandidateValue("Prishtina, Kosovo")).toBe(
      "Prishtina, Kosovo",
    );
    expect(sanitizeSearchLocationCandidateValue(null)).toBeNull();
  });
});

describe("imported strengths vs skills", () => {
  const vocabulary = new Set(["react", "typescript"]);

  it("recognises named technologies without a hard-coded brand list", () => {
    // Already listed as a skill by the same resume.
    expect(isNamedTechnologyStrength("React", vocabulary)).toBe(true);
    // Technology punctuation.
    expect(isNamedTechnologyStrength("C#", vocabulary)).toBe(true);
    expect(isNamedTechnologyStrength("ASP.NET", vocabulary)).toBe(true);
    expect(isNamedTechnologyStrength(".NET Framework", vocabulary)).toBe(true);
    // Single word with an internal capital.
    expect(isNamedTechnologyStrength("MongoDB", vocabulary)).toBe(true);
    // Genuine strengths survive.
    expect(isNamedTechnologyStrength("systems thinking", vocabulary)).toBe(
      false,
    );
    expect(isNamedTechnologyStrength("mentoring", vocabulary)).toBe(false);
  });

  it("relocates technologies into Skills instead of dropping them", () => {
    const partition = partitionStrengthsAndSkills({
      skills: ["React", "TypeScript"],
      strengths: [
        "C#",
        "ASP.NET",
        ".NET Framework",
        "MongoDB",
        "React",
        "systems thinking",
      ],
    });

    // The profile tells the user that named technologies belong in Skills;
    // an imported profile must not break that rule in the same panel.
    expect(partition.strengths).toEqual(["systems thinking"]);
    expect(partition.skills).toEqual([
      "React",
      "TypeScript",
      "C#",
      "ASP.NET",
      ".NET Framework",
      "MongoDB",
    ]);
  });

  it("leaves a phrase-only strengths list untouched", () => {
    const partition = partitionStrengthsAndSkills({
      skills: ["React"],
      strengths: ["systems thinking", "calm in incidents"],
    });

    expect(partition.strengths).toEqual([
      "systems thinking",
      "calm in incidents",
    ]);
    expect(partition.skills).toEqual(["React"]);
  });
});
