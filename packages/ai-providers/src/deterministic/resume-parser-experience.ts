import { dateRangePattern, experienceSectionAliases } from "./constants";
import {
  cleanLine,
  findSectionBodyLinesByAliases,
  normalizeLocationLabel,
  splitLines,
  uniqueStrings,
} from "./utils";
import { inferSkills } from "./resume-parser-skills";

export function normalizeHeadlineText(value: string): string {
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

export function inferExperienceEntries(resumeText: string) {
  const sectionLines = findSectionBodyLinesByAliases(splitLines(resumeText), experienceSectionAliases);

  return splitExperienceBlocks(sectionLines)
    .map((block) => {
      const companyContext = isCompanyMarkerLine(block[0] ?? "") ? parseCompanyMarker(block[0] ?? "") : null;
      const headerLine = companyContext ? (block[1] ?? "") : (block[0] ?? "");
      const dateRange = parseDateRange(headerLine);
      const titleValue = cleanLine(headerLine.replace(dateRangePattern, "").replace(/[|,–—-]+\s*$/g, "")) || null;
      const rawDetailLines = block
        .slice(companyContext ? 2 : 1)
        .filter((line) => line.length > 0 && !isCompanyMarkerLine(line));
      const summarySourceLine = rawDetailLines.find(
        (line) => !/^project lead\b/i.test(line) && !/^[•*-]\s*/.test(line),
      ) ?? null;
      const detailLines = rawDetailLines
        .map((line) => cleanLine(line.replace(/^[•*-]\s*/, "")))
        .filter((line) => line.length > 0);
      const summaryLine = summarySourceLine ? cleanLine(summarySourceLine.replace(/^[•*-]\s*/, "")) || null : null;
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
