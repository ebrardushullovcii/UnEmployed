import type {
  CandidateProfile,
  ExtractProfileFromResumeInput,
  JobSearchPreferences,
  ResumeProfileExtraction,
} from "../shared";
import { ResumeProfileExtractionSchema } from "../shared";
import {
  contactOrMetaPattern,
  dateRangePattern,
  experienceSectionAliases,
  headlineKeywordPattern,
  knownSkillPhrases,
  knownSoftSkillPhrases,
  skillCategoryHeadingPattern,
  skillSectionAliases,
  summarySectionAliases,
} from "./constants";
import {
  cleanLine,
  extractAllUrls,
  extractFirstUrl,
  extractRegexMatch,
  findSectionBodyLinesByAliases,
  isLikelyPersonalWebsiteUrl,
  isResumeSectionHeading,
  normalizeLocationLabel,
  splitLines,
  titleCaseWords,
  uniqueStrings,
} from "./utils";

function normalizeHeadlineText(value: string): string {
  const normalized = cleanLine(
    value
      .replace(
        /\s+[–—-]\s+(?:\d{2}\/\d{4}|\d{4})\s+[–—-]\s+(?:current|present|\d{2}\/\d{4}|\d{4}).*$/i,
        "",
      )
      .replace(/\s+[–—-]\s+current$/i, ""),
  );

  const knownCaseMap: Record<string, string> = {
    react: "React",
    "next.js": "Next.js",
    "node.js": "Node.js",
    node: "Node",
    ".net": ".NET",
    "asp.net": "ASP.NET",
    javascript: "JavaScript",
    typescript: "TypeScript",
    qa: "QA",
    ui: "UI",
    ux: "UX",
  };

  const formatSegment = (segment: string): string => {
    const match = segment.match(/^([^A-Za-z0-9.]*)((?:[A-Za-z0-9.]+))(.*)$/);

    if (!match) {
      return segment;
    }

    const prefix = match[1] ?? "";
    const core = match[2] ?? "";
    const suffix = match[3] ?? "";
    const lowerCore = core.toLowerCase();
    const formattedCore =
      knownCaseMap[lowerCore] ??
      (lowerCore.length > 0
        ? `${lowerCore[0]?.toUpperCase() ?? ""}${lowerCore.slice(1)}`
        : core);

    return `${prefix}${formattedCore}${suffix}`;
  };

  return normalized
    .split(/\s+/)
    .map((token) => token.split("/").map(formatSegment).join("/"))
    .join(" ");
}

function inferCurrentLocation(lines: readonly string[]): string | null {
  const addressLine = lines.find((line) => /^Address:/i.test(line));

  if (addressLine) {
    const cleaned = cleanLine(
      addressLine.replace(/^Address:\s*/i, "").replace(/\s*\([^)]*\)\s*$/g, ""),
    );

    if (cleaned) {
      return cleaned;
    }
  }

  const fallbackLine = lines.find(
    (line) =>
      /^[A-Za-z][A-Za-z\s.'-]+,\s*[A-Za-z][A-Za-z\s.'-]+$/.test(line) &&
      !/–/.test(line) &&
      !contactOrMetaPattern.test(line),
  );

  return fallbackLine ?? null;
}

function inferPhone(resumeText: string, existingPhone: string | null): string | null {
  const labeledMatch = resumeText.match(
    /Phone:\s*([^\n]+?)(?:\s+Email:|\s+Website:|\s+Address:|$)/i,
  );

  if (labeledMatch?.[1]) {
    const cleaned = cleanLine(
      labeledMatch[1].replace(/\s*\((?:mobile|home|work)\)\s*$/i, ""),
    );

    if (cleaned) {
      return cleaned;
    }
  }

  return extractRegexMatch(resumeText, /(\(?\+?\d[\d\s().-]{7,}\d\)?)/) ?? existingPhone;
}

function inferPortfolioUrl(resumeText: string): string | null {
  return extractAllUrls(resumeText).find((url) => !/linkedin\.com/i.test(url)) ?? null;
}

function inferName(lines: readonly string[]): string | null {
  const candidate = lines.find(
    (line) =>
      !line.includes("@") &&
      !/^https?:\/\//i.test(line) &&
      !/resume|curriculum|summary|profile|experience|birth|nationality|phone|email|address/i.test(line) &&
      line.split(" ").length >= 2 &&
      line.split(" ").length <= 5 &&
      line.length <= 48 &&
      /^[A-Za-z\s'-]+$/.test(line),
  );

  return candidate ?? null;
}

function parseNameParts(fullName: string | null) {
  if (!fullName) {
    return { firstName: null, lastName: null, middleName: null };
  }

  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return { firstName: null, lastName: null, middleName: null };
  }

  if (parts.length === 1) {
    return { firstName: parts[0] ?? null, lastName: null, middleName: null };
  }

  if (parts.length === 2) {
    return { firstName: parts[0] ?? null, lastName: parts[1] ?? null, middleName: null };
  }

  return {
    firstName: parts[0] ?? null,
    lastName: parts[parts.length - 1] ?? null,
    middleName: parts.slice(1, -1).join(" ") || null,
  };
}

function inferHeadline(lines: readonly string[]): string | null {
  const candidate = lines.find(
    (line) =>
      !line.includes("@") &&
      !/^https?:\/\//i.test(line) &&
      !contactOrMetaPattern.test(line) &&
      headlineKeywordPattern.test(line) &&
      line.length <= 72 &&
      line.split(/\s+/).length <= 10,
  );

  return candidate ? normalizeHeadlineText(candidate) : null;
}

function inferSummary(lines: readonly string[]): string | null {
  const aboutLines = findSectionBodyLinesByAliases(lines, summarySectionAliases).filter(
    (line) =>
      !/date of birth|nationality|phone|email|website|address/i.test(line) &&
      !/^https?:\/\//i.test(line),
  );

  if (aboutLines.length > 0) {
    return cleanLine(aboutLines.join(" "));
  }

  return (
    lines.find(
      (line) =>
        line.length >= 48 &&
        !line.includes("@") &&
        !/^https?:\/\//i.test(line) &&
        !/date of birth|nationality|phone|email|website|address/i.test(line) &&
        !isResumeSectionHeading(line),
    ) ?? null
  );
}

function inferKnownPhrases(text: string, phrases: readonly string[]): string[] {
  const lowerText = text.toLowerCase();
  return uniqueStrings(phrases.filter((phrase) => lowerText.includes(phrase.toLowerCase())));
}

function inferSkills(resumeText: string, fallbackSkills: readonly string[]): string[] {
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

function inferSkillGroups(resumeText: string, fallbackSkills: readonly string[]) {
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

function inferTimeZoneFromLocation(location: string | null): string | null {
  if (!location) {
    return null;
  }

  const normalizedLocation = location.toLowerCase();
  const knownMappings: Array<[RegExp, string]> = [
    [/prishtina|kosovo/, "Europe/Belgrade"],
    [/london|united kingdom|uk\b|england/, "Europe/London"],
    [/new york/, "America/New_York"],
    [/berlin|germany/, "Europe/Berlin"],
    [/paris|france/, "Europe/Paris"],
    [/toronto/, "America/Toronto"],
    [/zurich|switzerland/, "Europe/Zurich"],
    [/sydney|melbourne/, "Australia/Sydney"],
    [/tokyo|japan/, "Asia/Tokyo"],
    [/mumbai|delhi|bangalore|india/, "Asia/Kolkata"],
    [/sao paulo/, "America/Sao_Paulo"],
    [/singapore/, "Asia/Singapore"],
    [/hong kong/, "Asia/Hong_Kong"],
    [/dubai|uae/, "Asia/Dubai"],
    [/tel aviv|israel/, "Asia/Jerusalem"],
    [/amsterdam|netherlands/, "Europe/Amsterdam"],
    [/stockholm|sweden/, "Europe/Stockholm"],
    [/oslo|norway/, "Europe/Oslo"],
    [/copenhagen|denmark/, "Europe/Copenhagen"],
    [/helsinki|finland/, "Europe/Helsinki"],
  ];

  for (const [pattern, timeZone] of knownMappings) {
    if (pattern.test(normalizedLocation)) {
      return timeZone;
    }
  }

  return null;
}

function inferSalaryCurrencyFromLocation(location: string | null): string | null {
  if (!location) {
    return null;
  }

  const normalizedLocation = location.toLowerCase();
  const knownMappings: Array<[RegExp, string]> = [
    [/prishtina|kosovo|germany|berlin|france|paris|spain|italy|netherlands|belgium|austria|portugal|finland|ireland|greece/, "EUR"],
    [/london|united kingdom|uk\b|england/, "GBP"],
    [/switzerland|zurich|geneva/, "CHF"],
    [/toronto|canada/, "CAD"],
    [/new york|usa|united states/, "USD"],
    [/sydney|melbourne|australia/, "AUD"],
    [/tokyo|japan/, "JPY"],
    [/mumbai|delhi|bangalore|india/, "INR"],
    [/sao paulo|brazil/, "BRL"],
    [/singapore/, "SGD"],
    [/hong kong/, "HKD"],
    [/dubai|uae/, "AED"],
    [/tel aviv|israel/, "ILS"],
  ];

  for (const [pattern, currency] of knownMappings) {
    if (pattern.test(normalizedLocation)) {
      return currency;
    }
  }

  return null;
}

function inferProfessionalSummary(summary: string | null, headline: string | null, skills: readonly string[]) {
  const firstSentence = cleanLine(summary?.split(/(?<=[.!?])\s+/)[0] ?? "") || null;

  return {
    shortValueProposition: firstSentence,
    fullSummary: summary,
    careerThemes: uniqueStrings([headline ?? "", ...skills.slice(0, 3)]),
    leadershipSummary: null,
    domainFocusSummary: null,
    strengths: uniqueStrings(skills.slice(0, 5)),
  };
}

function parseDateRange(line: string) {
  const match = line.match(dateRangePattern);

  if (!match) {
    return { startDate: null, endDate: null, isCurrent: false };
  }

  const startDate = match[1] ?? null;
  const rawEndDate = match[2] ?? null;
  const isCurrent = rawEndDate ? /current|present/i.test(rawEndDate) : false;

  return { startDate, endDate: isCurrent ? null : rawEndDate, isCurrent };
}

function isCompanyMarkerLine(line: string): boolean {
  const cleaned = cleanLine(line.replace(/^[^A-Za-z0-9]+/, ""));
  return /^[A-Z0-9&.'()/-]+(?:\s+[A-Z0-9&.'()/-]+)*\s*[–—-]\s*[A-Z][A-Z\s.'-]+,\s*[A-Z][A-Z\s.'-]+$/.test(cleaned);
}

function parseCompanyMarker(line: string) {
  const cleaned = cleanLine(line.replace(/^[^A-Za-z0-9]+/, ""));
  const match = cleaned.match(
    /^([A-Z0-9&.'()/-]+(?:\s+[A-Z0-9&.'()/-]+)*)\s*[–—-]\s*([A-Z][A-Z\s.'-]+,\s*[A-Z][A-Z\s.'-]+)$/,
  );

  if (!match) {
    return { companyName: null, location: null };
  }

  return { companyName: cleanLine(match[1] ?? "") || null, location: normalizeLocationLabel(match[2] ?? null) };
}

function splitExperienceBlocks(lines: readonly string[]): string[][] {
  const blocks: string[][] = [];
  let currentBlock: string[] = [];
  let pendingCompanyMarker: string | null = null;

  for (const line of lines) {
    if (isCompanyMarkerLine(line)) {
      pendingCompanyMarker = line;
      continue;
    }

    const startsNewBlock = dateRangePattern.test(line);

    if (startsNewBlock) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
      }

      currentBlock = pendingCompanyMarker ? [pendingCompanyMarker, line] : [line];
      pendingCompanyMarker = null;
      continue;
    }

    if (currentBlock.length > 0) {
      currentBlock.push(line);
    }
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  return blocks.filter((block) => block.some((line) => dateRangePattern.test(line)));
}

function inferExperienceEntries(resumeText: string) {
  const sectionLines = findSectionBodyLinesByAliases(splitLines(resumeText), experienceSectionAliases);

  return splitExperienceBlocks(sectionLines)
    .map((block) => {
      const companyContext = isCompanyMarkerLine(block[0] ?? "") ? parseCompanyMarker(block[0] ?? "") : null;
      const headerLine = companyContext ? (block[1] ?? "") : (block[0] ?? "");
      const dateRange = parseDateRange(headerLine);
      const titleValue = cleanLine(headerLine.replace(dateRangePattern, "").replace(/[|,–—-]+\s*$/g, "")) || null;
      const detailLines = block
        .slice(companyContext ? 2 : 1)
        .map((line) => cleanLine(line.replace(/^[•*-]\s*/, "")))
        .filter((line) => line.length > 0 && !isCompanyMarkerLine(line));
      const summaryLine = detailLines.find((line) => !/^project lead\b/i.test(line)) ?? null;
      const achievementLines = detailLines.filter((line) => line !== summaryLine);

      return {
        companyName: companyContext?.companyName ?? null,
        companyUrl: null,
        title: titleValue ? normalizeHeadlineText(titleValue) : null,
        employmentType: null,
        location: companyContext?.location ?? null,
        workMode: null,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        isCurrent: dateRange.isCurrent,
        summary: summaryLine,
        achievements: uniqueStrings(achievementLines.filter((line) => line.length >= 24).slice(0, 6)),
        skills: inferSkills(block.join("\n"), []),
        domainTags: [],
        peopleManagementScope: null,
        ownershipScope: null,
      };
    })
    .filter((entry) => entry.title || entry.companyName || entry.summary);
}

function inferLinkKind(url: string): "linkedin" | "github" | "website" {
  if (/linkedin\.com/i.test(url)) {
    return "linkedin";
  }

  if (/github\.com/i.test(url)) {
    return "github";
  }

  return "website";
}

function inferLinkLabel(url: string): string {
  if (/linkedin\.com/i.test(url)) {
    return "LinkedIn";
  }

  if (/github\.com/i.test(url)) {
    return "GitHub";
  }

  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "Website";
  }
}

function inferLinks(resumeText: string) {
  return extractAllUrls(resumeText).map((url) => ({
    label: inferLinkLabel(url),
    url,
    kind: inferLinkKind(url),
  }));
}

function inferEducationEntries(resumeText: string) {
  const lines = splitLines(resumeText);
  const educationLine = lines.find(
    (line) =>
      /degree|bachelor|master|phd/i.test(line) &&
      /(college|university|school|institute|kolegji)/i.test(line) &&
      !isResumeSectionHeading(line),
  );

  if (!educationLine) {
    return [];
  }

  const schoolKeywordMatch = educationLine.match(/\b(College|University|School|Institute|Kolegji)\b/i);
  const schoolName = schoolKeywordMatch?.index !== undefined ? cleanLine(educationLine.slice(schoolKeywordMatch.index)) : null;
  const detailsPart = schoolKeywordMatch?.index !== undefined ? cleanLine(educationLine.slice(0, schoolKeywordMatch.index)) : educationLine;
  const [degreePart, fieldPart] = detailsPart.split(",").map(cleanLine);
  const locationLine = lines[lines.indexOf(educationLine) - 1];

  return [
    {
      schoolName,
      degree: degreePart || null,
      fieldOfStudy: fieldPart || null,
      location: normalizeLocationLabel(locationLine ?? null),
      startDate: null,
      endDate: null,
      summary: null,
    },
  ].filter((entry) => entry.schoolName || entry.degree || entry.fieldOfStudy);
}

function inferSpokenLanguages(resumeText: string) {
  const lines = splitLines(resumeText);
  const entries: Array<{ language: string | null; proficiency: string | null; interviewPreference: boolean; notes: string | null }> = [];
  const motherTongueMatch = resumeText.match(/Mother tongue\(s\):\s*([A-Za-z]+)/i);

  if (motherTongueMatch?.[1]) {
    entries.push({
      language: titleCaseWords(motherTongueMatch[1]),
      proficiency: "Native",
      interviewPreference: true,
      notes: null,
    });
  }

  for (const line of lines) {
    const proficiencyMatch = line.match(
      /^([A-Z][A-Z\s]+?)\s+(A1|A2|B1|B2|C1|C2)(?:\s+(A1|A2|B1|B2|C1|C2)){4}$/,
    );

    if (!proficiencyMatch) {
      continue;
    }

    entries.push({
      language: titleCaseWords(proficiencyMatch[1] ?? ""),
      proficiency: proficiencyMatch[2] ?? null,
      interviewPreference: false,
      notes: null,
    });
  }

  return entries.filter((entry) => entry.language);
}

function buildProfileExtractionNotes(input: {
  fullName: string | null;
  headline: string | null;
  summary: string | null;
  currentLocation: string | null;
}): string[] {
  const notes: string[] = [];

  if (!input.fullName) {
    notes.push("Review the imported name because the parser could not confidently extract it.");
  }

  if (!input.headline) {
    notes.push("Add a preferred headline if the resume does not expose a clear current role.");
  }

  if (!input.summary) {
    notes.push("Add a short professional summary if the resume does not include one.");
  }

  if (!input.currentLocation) {
    notes.push("Confirm the preferred location because the resume did not expose a clear location line.");
  }

  return notes;
}

function inferTargetRoles(headline: string | null, existingProfile: CandidateProfile): string[] {
  if (!headline) {
    return uniqueStrings(existingProfile.targetRoles);
  }

  return [headline];
}

function inferLocations(currentLocation: string | null, profile: CandidateProfile, searchPreferences: JobSearchPreferences): string[] {
  if (currentLocation) {
    return uniqueStrings([currentLocation]);
  }

  if (profile.locations.length > 0) {
    return uniqueStrings(profile.locations);
  }

  if (searchPreferences.locations.length > 0) {
    return uniqueStrings(searchPreferences.locations);
  }

  return uniqueStrings([profile.currentLocation]);
}

function inferGithubUrl(resumeText: string): string | null {
  const match = extractFirstUrl(
    resumeText,
    /https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_-]+\/?$/i,
  );
  if (match) {
    try {
      const url = new URL(match);
      const pathParts = url.pathname.split("/").filter(Boolean);
      if (pathParts.length === 1) {
        return match.replace(/\/$/, "");
      }
    } catch {
      // Ignore URL parsing errors
    }
  }
  return null;
}

function inferPersonalWebsiteUrl(resumeText: string): string | null {
  return extractAllUrls(resumeText).find((url) => isLikelyPersonalWebsiteUrl(url)) ?? null;
}

export function buildDeterministicResumeProfileExtraction(
  input: ExtractProfileFromResumeInput,
  analysisProviderKind: ResumeProfileExtraction["analysisProviderKind"],
  analysisProviderLabel: string,
): ResumeProfileExtraction {
  const lines = splitLines(input.resumeText);
  const fullName = inferName(lines);
  const nameParts = parseNameParts(fullName);
  const headline = inferHeadline(lines) ?? input.existingProfile.headline;
  const summary = inferSummary(lines) ?? input.existingProfile.summary;
  const currentLocation = inferCurrentLocation(lines);
  const skills = inferSkills(input.resumeText, input.existingProfile.skills);
  const skillGroups = inferSkillGroups(input.resumeText, skills);
  const personalWebsiteUrl = inferPersonalWebsiteUrl(input.resumeText) ?? input.existingProfile.personalWebsiteUrl;
  const portfolioUrl = inferPortfolioUrl(input.resumeText) ?? personalWebsiteUrl ?? input.existingProfile.portfolioUrl;
  const education = inferEducationEntries(input.resumeText);
  const notes = buildProfileExtractionNotes({ fullName, headline, summary, currentLocation });

  return ResumeProfileExtractionSchema.parse({
    firstName: nameParts.firstName ?? input.existingProfile.firstName,
    lastName: nameParts.lastName ?? input.existingProfile.lastName,
    middleName: nameParts.middleName ?? input.existingProfile.middleName,
    fullName: fullName ?? input.existingProfile.fullName,
    headline,
    summary,
    currentLocation: currentLocation ?? input.existingProfile.currentLocation,
    timeZone: inferTimeZoneFromLocation(currentLocation) ?? input.existingProfile.timeZone,
    salaryCurrency: inferSalaryCurrencyFromLocation(currentLocation) ?? input.existingSearchPreferences.salaryCurrency,
    yearsExperience:
      Number.parseInt(
        extractRegexMatch(input.resumeText, /\b\d{1,2}\+?\s+years?\b/i)?.match(/\d+/)?.[0] ?? "",
        10,
      ) || input.existingProfile.yearsExperience,
    email: extractRegexMatch(input.resumeText, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) ?? input.existingProfile.email,
    phone: inferPhone(input.resumeText, input.existingProfile.phone),
    portfolioUrl,
    linkedinUrl:
      extractFirstUrl(input.resumeText, /https?:\/\/(?:www\.)?linkedin\.com\/[\w./?%&=+-]*/i) ??
      input.existingProfile.linkedinUrl,
    githubUrl: inferGithubUrl(input.resumeText) ?? input.existingProfile.githubUrl,
    personalWebsiteUrl,
    professionalSummary: inferProfessionalSummary(summary, headline, skillGroups.highlightedSkills),
    skillGroups,
    skills,
    targetRoles: inferTargetRoles(headline, input.existingProfile),
    preferredLocations: inferLocations(currentLocation, input.existingProfile, input.existingSearchPreferences),
    experiences: inferExperienceEntries(input.resumeText),
    education,
    certifications: [],
    links: inferLinks(input.resumeText),
    projects: [],
    spokenLanguages: inferSpokenLanguages(input.resumeText),
    analysisProviderKind,
    analysisProviderLabel,
    notes,
  });
}
