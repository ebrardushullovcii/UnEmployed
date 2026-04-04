import type {
  ExtractProfileFromResumeInput,
  ResumeProfileExtraction,
} from "../shared";
import type { CandidateLinkKind, CandidateProfile, JobSearchPreferences } from "@unemployed/contracts";
import { ResumeProfileExtractionSchema } from "../shared";
import {
  contactOrMetaPattern,
  headlineKeywordPattern,
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
import {
  inferSkillGroups,
  inferSkills,
} from "./resume-parser-skills";
import {
  inferExperienceEntries,
  normalizeHeadlineText,
} from "./resume-parser-experience";

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

  const locationHintPattern = /\b(?:[A-Z]{2}|UK|USA|UAE|Kosovo|Canada|Germany|France|India|Japan|Australia|Singapore|London|Toronto|Berlin|Paris|Prishtina|New York)\b|\b\d{5}(?:-\d{4})?\b/;
  const degreeOrSchoolPattern = /\b(?:Bachelor|Master|B\.?Sc|M\.?Sc|Ph\.?D|University|College|School|Academy)\b/i;
  const roleOrCompanyPattern = /\b(?:Engineer|Developer|Designer|Manager|Director|Analyst|Consultant|Specialist|Intern|Lead|Inc|Corp|LLC|Ltd|GmbH)\b/i;

  const fallbackLine = lines.find(
    (line) =>
      /^[A-Za-z][A-Za-z\s.'-]+,\s*[A-Za-z][A-Za-z\s.'-]+$/.test(line) &&
      !/–/.test(line) &&
      !contactOrMetaPattern.test(line) &&
      locationHintPattern.test(line) &&
      !degreeOrSchoolPattern.test(line) &&
      !roleOrCompanyPattern.test(line),
  );

  return normalizeLocationLabel(fallbackLine ?? null);
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

function inferPortfolioUrl(
  resumeText: string,
  personalWebsiteUrl?: string | null,
): string | null {
  const trimmedPersonalWebsiteUrl = personalWebsiteUrl?.trim() ?? "";
  if (trimmedPersonalWebsiteUrl) {
    return trimmedPersonalWebsiteUrl;
  }

  const portfolioSignals = [
    "portfolio",
    "showcase",
    "projects",
    "website",
    "site",
    "github",
    "gitlab",
    "behance",
    "dribbble",
    "codepen",
  ];
  const excludedDomains = [
    "linkedin.com",
    "coursera.org",
    "udemy.com",
    "skillshare.com",
    "pluralsight.com",
    "indeed.com",
    "glassdoor.com",
    "monster.com",
    "ziprecruiter.com",
  ];

  return (
    extractAllUrls(resumeText).find((url) => {
      try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname.toLowerCase();
        const haystack = `${hostname}${parsedUrl.pathname}`.toLowerCase();

        if (excludedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
          return false;
        }

        return portfolioSignals.some((signal) => haystack.includes(signal));
      } catch {
        return false;
      }
    }) ?? null
  );
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


function inferLinkKind(url: string): CandidateLinkKind {
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
  const detailsParts = detailsPart.split(",").map(cleanLine);
  const degreePart = detailsParts[0] ?? null;
  const fieldPart = detailsParts[1] ?? null;
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
  const portfolioUrl = inferPortfolioUrl(input.resumeText, personalWebsiteUrl) ?? input.existingProfile.portfolioUrl;
  const education = inferEducationEntries(input.resumeText);
  const notes = buildProfileExtractionNotes({ fullName, headline, summary, currentLocation });
  const parsedYearsExperience = Number.parseInt(
    extractRegexMatch(input.resumeText, /\b\d{1,2}\+?\s+years?\b/i)?.match(/\d+/)?.[0] ?? "",
    10,
  );

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
    yearsExperience: Number.isNaN(parsedYearsExperience)
      ? input.existingProfile.yearsExperience
      : parsedYearsExperience,
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
