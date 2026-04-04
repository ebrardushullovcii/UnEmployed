import {
  knownSkillPhrases,
  knownSoftSkillPhrases,
  skillCategoryHeadingPattern,
  skillSectionAliases,
} from "./constants";
import {
  cleanLine,
  findSectionBodyLinesByAliases,
  splitLines,
  uniqueStrings,
} from "./utils";

function inferKnownPhrases(text: string, phrases: readonly string[]): string[] {
  const lowerText = text.toLowerCase();
  return uniqueStrings(phrases.filter((phrase) => lowerText.includes(phrase.toLowerCase())));
}

export function inferSkills(
  resumeText: string,
  fallbackSkills: readonly string[],
): string[] {
  const sectionLines = findSectionBodyLinesByAliases(splitLines(resumeText), skillSectionAliases);
  const sectionText = sectionLines.join("\n");
  const matchedKnownSkills = uniqueStrings(
    knownSkillPhrases.filter((skill) => sectionText.toLowerCase().includes(skill.toLowerCase())),
  );
  const nonNestedMatchedSkills = matchedKnownSkills.filter(
    (skill) => !matchedKnownSkills.some((other) => other !== skill && other.toLowerCase().includes(skill.toLowerCase())),
  );
  const rawSectionSkills = sectionLines
    .filter((line) => !skillCategoryHeadingPattern.test(line))
    .flatMap((line) => line.split(/,|\||\u2022/))
    .map(cleanLine)
    .filter((entry) => entry.length >= 2 && entry.length <= 28)
    .filter((entry) => {
      const overlappingKnownSkills = knownSkillPhrases.filter((skill) => entry.toLowerCase().includes(skill.toLowerCase()));
      if (overlappingKnownSkills.length > 1) {
        return false;
      }
      return !nonNestedMatchedSkills.some((skill) => skill.toLowerCase() === entry.toLowerCase());
    });
  const sectionSkills = uniqueStrings([...nonNestedMatchedSkills, ...rawSectionSkills]);

  if (sectionSkills.length > 0) {
    return uniqueStrings(sectionSkills);
  }

  const lowerText = resumeText.toLowerCase();
  const extractedSkills = knownSkillPhrases.filter((skill) => lowerText.includes(skill.toLowerCase()));
  const nonNestedExtracted = extractedSkills.filter(
    (skill) => !extractedSkills.some((other) => other !== skill && other.toLowerCase().includes(skill.toLowerCase())),
  );
  return nonNestedExtracted.length > 0 ? uniqueStrings(nonNestedExtracted) : uniqueStrings(fallbackSkills);
}

function splitSkillLine(line: string): string[] {
  const rawEntries = line
    .split(/,|\||\u2022| {2,}/)
    .map(cleanLine)
    .filter((entry) => entry.length >= 2 && entry.length <= 40);

  if (rawEntries.length === 0) {
    const matchedKnownSkills = inferKnownPhrases(line, knownSkillPhrases);
    const nonNested = matchedKnownSkills.filter(
      (skill) => !matchedKnownSkills.some((other) => other !== skill && other.toLowerCase().includes(skill.toLowerCase())),
    );
    return nonNested.length > 0 ? nonNested : [];
  }

  const entryMatches = rawEntries.map((entry) => {
    const matches = inferKnownPhrases(entry, knownSkillPhrases);
    return matches.filter(
      (skill) => !matches.some((other) => other !== skill && other.toLowerCase().includes(skill.toLowerCase())),
    );
  });

  const rawUnmatched = rawEntries.filter((entry) => inferKnownPhrases(entry, knownSkillPhrases).length === 0);

  return uniqueStrings([...entryMatches.flat(), ...rawUnmatched]);
}

export function inferSkillGroups(
  resumeText: string,
  fallbackSkills: readonly string[],
) {
  const sectionLines = findSectionBodyLinesByAliases(splitLines(resumeText), skillSectionAliases);
  const groups = {
    coreSkills: [] as string[],
    tools: [] as string[],
    languagesAndFrameworks: [] as string[],
    softSkills: [] as string[],
    highlightedSkills: [] as string[],
  };
  let activeGroup: keyof typeof groups = "coreSkills";

  for (const line of sectionLines) {
    if (/^(frameworks|programming languages|languages)$/i.test(line)) {
      activeGroup = "languagesAndFrameworks";
      continue;
    }

    if (/^(databases|tools|security(?:\s*&\s*authentication)?)$/i.test(line)) {
      activeGroup = "tools";
      continue;
    }

    if (/^soft skills$/i.test(line)) {
      activeGroup = "softSkills";
      continue;
    }

    if (skillCategoryHeadingPattern.test(line)) {
      continue;
    }

    if (activeGroup === "softSkills") {
      groups.softSkills.push(...inferKnownPhrases(line, knownSoftSkillPhrases));
      continue;
    }

    groups[activeGroup].push(...splitSkillLine(line));
  }

  const allSkills = inferSkills(resumeText, fallbackSkills);

  return {
    coreSkills: uniqueStrings(groups.coreSkills.length > 0 ? groups.coreSkills : allSkills.slice(0, 8)),
    tools: uniqueStrings(groups.tools),
    languagesAndFrameworks: uniqueStrings(groups.languagesAndFrameworks),
    softSkills: uniqueStrings(groups.softSkills),
    highlightedSkills: uniqueStrings([
      ...groups.coreSkills.slice(0, 4),
      ...groups.languagesAndFrameworks.slice(0, 4),
      ...allSkills.slice(0, 4),
    ]).slice(0, 8),
  };
}
