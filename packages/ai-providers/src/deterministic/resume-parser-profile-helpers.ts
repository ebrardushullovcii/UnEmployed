import type { CandidateLinkKind, CandidateProfile, JobSearchPreferences } from "@unemployed/contracts";

import { dateRangePattern } from "./constants";
import {
  cleanLine,
  extractAllUrls,
  extractFirstUrl,
  findSectionBodyLinesByAliases,
  isLikelyPersonalWebsiteUrl,
  isResumeSectionHeading,
  normalizeLocationLabel,
  splitLines,
  titleCaseWords,
  uniqueStrings,
} from "./utils";

export function inferTimeZoneFromLocation(location: string | null): string | null {
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

export function inferSalaryCurrencyFromLocation(location: string | null): string | null {
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

export function inferProfessionalSummary(
  summary: string | null,
  headline: string | null,
  skills: readonly string[],
) {
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

export function inferLinkKind(url: string): CandidateLinkKind {
  if (/linkedin\.com/i.test(url)) {
    return "linkedin";
  }

  if (/github\.com/i.test(url)) {
    return "github";
  }

  if (/(behance\.net|dribbble\.com|artstation\.com|adobe\.com\/portfolio)/i.test(url)) {
    return "portfolio";
  }

  if (/(gitlab\.com|bitbucket\.org)/i.test(url) || /\/(?:repo|repository|tree|blob)\//i.test(url)) {
    return "repository";
  }

  if (/\/(?:case[-_ ]study|case[-_ ]studies|work\/)/i.test(url)) {
    return "case_study";
  }

  if (/(portfolio|showcase|projects|my[-_ ]work)/i.test(url)) {
    return "portfolio";
  }

  if (/website|site/i.test(url)) {
    return "website";
  }

  return "other";
}

export function inferLinkLabel(url: string): string {
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

export function inferLinks(resumeText: string) {
  return extractAllUrls(resumeText).map((url) => ({
    label: inferLinkLabel(url),
    url,
    kind: inferLinkKind(url),
  }));
}

export function inferEducationEntries(resumeText: string) {
  const lines = splitLines(resumeText);
  const educationLines = findSectionBodyLinesByAliases(lines, ["EDUCATION AND TRAINING", "EDUCATION"] as const);
  const candidatePool = educationLines.length > 0 ? educationLines : lines;
  const educationLineIndex = candidatePool.findIndex(
    (line) =>
      /degree|bachelor|master|phd/i.test(line) &&
      /(college|university|school|institute|kolegji)/i.test(line) &&
      !isResumeSectionHeading(line),
  );

  if (educationLineIndex === -1) {
    return [];
  }

  const educationLine = candidatePool[educationLineIndex] ?? "";
  const schoolMatch = educationLine.match(
    /((?:[A-Z][A-Za-z'().&-]*\s+){0,6}(?:College|University|School|Institute|Kolegji)(?:\s+[A-Z][A-Za-z'().&-]*)*(?:\s*\([^)]*\))?)/i,
  );

  let schoolName: string | null = null;
  let degree: string | null = null;
  let fieldOfStudy: string | null = null;

  const splitParts = educationLine
    .split(/\s+[–—-]\s+/)
    .map((part) => cleanLine(part))
    .filter(Boolean);

  if (splitParts.length >= 2) {
    const [left, right] = splitParts;
    const leftHasSchool = /(college|university|school|institute|kolegji)/i.test(left ?? "");
    const rightHasSchool = /(college|university|school|institute|kolegji)/i.test(right ?? "");

    if (leftHasSchool && !rightHasSchool) {
      schoolName = left ?? null;
      degree = right ?? null;
    } else if (!leftHasSchool && rightHasSchool) {
      degree = left ?? null;
      schoolName = right ?? null;
    }
  }

  const schoolKeywordIndex = educationLine.search(/\b(?:College|University|School|Institute|Kolegji)\b/i);

  if (!schoolName && schoolKeywordIndex !== -1 && /degree|bachelor|master|phd/i.test(educationLine.slice(0, schoolKeywordIndex))) {
    schoolName = cleanLine(educationLine.slice(schoolKeywordIndex));
    const detailParts = cleanLine(educationLine.slice(0, schoolKeywordIndex)).replace(/^[,\s–—-]+|[,\s–—-]+$/g, "");

    if (detailParts) {
      const segments = detailParts.split(",").map((part) => cleanLine(part)).filter(Boolean);
      degree = segments[0] ?? detailParts;
      fieldOfStudy = segments.length > 1 ? segments.slice(1).join(", ") : null;
    }
  }

  if (!schoolName && schoolMatch?.[1]) {
    schoolName = cleanLine(schoolMatch[1]);
    const detailParts = cleanLine(educationLine.replace(schoolMatch[1], "")).replace(/^[,\s–—-]+|[,\s–—-]+$/g, "");

    if (detailParts) {
      const segments = detailParts.split(",").map((part) => cleanLine(part)).filter(Boolean);
      degree = segments[0] ?? detailParts;
      fieldOfStudy = segments.length > 1 ? segments.slice(1).join(", ") : null;
    }
  }

  if (degree) {
    const degreeWithFieldMatch = degree.match(/^(.*?degree)(?:\s+in\s+|,\s+)(.+)$/i);

    if (degreeWithFieldMatch) {
      degree = cleanLine(degreeWithFieldMatch[1] ?? degree);
      fieldOfStudy = fieldOfStudy ?? (cleanLine(degreeWithFieldMatch[2] ?? "") || null);
    }
  }

  const dateLine = [candidatePool[educationLineIndex + 1], candidatePool[educationLineIndex - 1]]
    .map((line) => cleanLine(line ?? ""))
    .find((line) => dateRangePattern.test(line)) ?? null;
  const dateMatch = dateLine?.match(dateRangePattern) ?? null;
  const locationLine = [candidatePool[educationLineIndex - 1], candidatePool[educationLineIndex + 1]]
    .map((line) => cleanLine(line ?? ""))
    .find((line) =>
      line.length > 0 &&
      line !== dateLine &&
      /^[A-Za-z][A-Za-z\s.'-]+,\s*(?:[A-Z]{2}|[A-Za-z][A-Za-z\s.'-]+)$/.test(line),
    ) ?? null;

  return [
    {
      schoolName: schoolName || null,
      degree: degree || null,
      fieldOfStudy: fieldOfStudy || null,
      location: normalizeLocationLabel(locationLine ?? null),
      startDate: dateMatch?.[1] ? cleanLine(dateMatch[1]) : null,
      endDate: dateMatch?.[2] ? cleanLine(dateMatch[2]) : null,
      summary: null,
    },
  ].filter((entry) => entry.schoolName || entry.degree || entry.fieldOfStudy);
}

export function inferSpokenLanguages(resumeText: string) {
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

export function buildProfileExtractionNotes(input: {
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

export function inferLocations(
  currentLocation: string | null,
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences,
): string[] {
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

export function inferGithubUrl(resumeText: string): string | null {
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

export function inferPersonalWebsiteUrl(resumeText: string): string | null {
  return extractAllUrls(resumeText).find((url) => isLikelyPersonalWebsiteUrl(url)) ?? null;
}
