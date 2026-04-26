import { dateRangePattern, experienceSectionAliases } from "./constants";
import {
  cleanLine,
  findSectionBodyLinesByAliases,
  normalizeLocationLabel,
  splitLines,
  uniqueStrings,
} from "./utils";
import { inferSkills } from "./resume-parser-skills";

const roleTitlePattern =
  /\b(engineer|developer|designer|manager|director|analyst|consultant|specialist|architect|officer|lead|support|administrator|scientist|qa|agent)\b/i;

function looksLikeRoleTitle(value: string): boolean {
  const cleaned = cleanLine(value.replace(/^[-|,]+\s*/, "").replace(/\([^)]*\)\s*$/g, ""));

  return cleaned.length > 0 && roleTitlePattern.test(cleaned);
}

function parseCompanyAndLocation(segment: string): {
  companyName: string | null;
  location: string | null;
} {
  const cleaned = cleanLine(segment.replace(/\([^)]*\)\s*$/g, ""));

  if (!cleaned) {
    return { companyName: null, location: null };
  }

  const parts = cleaned.split(",").map((part) => cleanLine(part)).filter(Boolean);
  const companyName = parts[0] ?? cleaned;
  const location = parts.length > 1 ? normalizeLocationLabel(parts.slice(1).join(", ")) : null;

  return {
    companyName: companyName || null,
    location,
  };
}

export function normalizeHeadlineText(value: string): string {
  const normalized = cleanLine(
    value
      .replace(
        /\s+[–—-]\s+(?:\d{1,2}\/\d{4}|\d{4})\s+[–—-]\s+(?:current|present|\d{1,2}\/\d{4}|\d{4}).*$/i,
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
    if (segment.includes("-")) {
      return segment.split("-").map((part) => formatSegment(part)).join("-");
    }

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

function splitEmbeddedExperienceLine(line: string): string[] {
  const cleaned = cleanLine(
    line
      .replace(/(?<=[A-Za-z%])(?=\.NET\b)/g, " ")
      .replace(/([.!?])(?=\.NET\b)/g, "$1 "),
  );

  if (!cleaned || !dateRangePattern.test(cleaned)) {
    return cleaned ? [cleaned] : [];
  }

  const tokens = cleaned.split(/\s+/).filter(Boolean);

  const looksLikeSplitPrefix = (value: string): boolean => {
    const prefix = cleanLine(value.replace(/[.]+$/g, ""));

    return (
      /[.!?]$/.test(value) ||
      isCompanyMarkerLine(prefix) ||
      /^[A-Z][A-Z\s.'-]+,\s*[A-Z][A-Z\s.'-]+\.?$/i.test(value)
    );
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const header = cleanLine(tokens.slice(index).join(" "));

    if (!header || !dateRangePattern.test(header)) {
      continue;
    }

    const parsedHeader = parseExperienceHeader(header, header, null);
    const tokenCount = header.split(/\s+/).length;

    if (!parsedHeader.title || !looksLikeRoleTitle(parsedHeader.title)) {
      continue;
    }

    if (tokenCount < 2 || tokenCount > 18) {
      continue;
    }

    const prefix = cleanLine(tokens.slice(0, index).join(" "));

    if (prefix && !looksLikeSplitPrefix(prefix)) {
      continue;
    }

    if (!prefix || header === cleaned) {
      continue;
    }

    return [prefix, header].filter(Boolean);
  }

  return [cleaned];
}

function normalizeExperienceSectionLines(lines: readonly string[]): string[] {
  return lines.flatMap((line) => splitEmbeddedExperienceLine(line));
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

function looksLikeInlineLocation(value: string): boolean {
  return /^[A-Z][A-Z\s.'-]+,\s*[A-Z][A-Z\s.'-]+$/i.test(value);
}

function extractLeadingInlineLocation(value: string): {
  location: string | null;
  remainder: string;
} | null {
  const cleaned = cleanLine(value.replace(/\s*[.]+\s*$/g, ""));
  const match = cleaned.match(/^([A-Z][A-Z\s.'-]+,\s*[A-Z][A-Z\s.'-]+)\s+(.+)$/i);

  if (!match) {
    return null;
  }

  const location = normalizeLocationLabel(match[1] ?? null);
  const remainder = cleanLine(match[2] ?? "");

  if (!location || !remainder) {
    return null;
  }

  return { location, remainder };
}

function extractTrailingRoleTitle(value: string): {
  title: string;
  prefix: string;
  location: string | null;
} | null {
  const leadingLocation = extractLeadingInlineLocation(value);
  const cleaned = cleanLine(leadingLocation?.remainder ?? value);

  if (!leadingLocation && !hasPollutedTitleSignals(cleaned)) {
    return null;
  }

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  let best: { title: string; prefix: string; location: string | null } | null = null;

  for (let start = Math.max(0, tokens.length - 8); start < tokens.length; start += 1) {
    const candidate = cleanLine(tokens.slice(start).join(" "));
    const normalizedCandidate = normalizeHeadlineText(candidate);

    if (!candidate || candidate.length > 72 || /[,:]/.test(candidate)) {
      continue;
    }

    if (!looksLikeRoleTitle(normalizedCandidate)) {
      continue;
    }

    best = {
      title: normalizedCandidate,
      prefix: cleanLine(tokens.slice(0, start).join(" ")),
      location: leadingLocation?.location ?? null,
    };
  }

  return best;
}

function hasPollutedTitleSignals(value: string): boolean {
  const cleaned = cleanLine(value);

  return (
    cleaned.length > 72 ||
    /[,:]/.test(cleaned) ||
    /\d/.test(cleaned) ||
    /%/.test(cleaned) ||
    /\.\./.test(cleaned) ||
    looksLikeInlineLocation(cleaned)
  );
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

function parseExperienceHeader(
  line: string,
  dateSourceLine: string,
  companyContext: { companyName: string | null; location: string | null } | null,
) {
  const dateRange = parseDateRange(dateSourceLine || line);
  const inlineDateMatch = line.match(dateRangePattern);
  const beforeDate = cleanLine(
    inlineDateMatch?.index !== undefined
      ? line.slice(0, inlineDateMatch.index).replace(/[|,()–—-]+\s*$/g, "")
      : line,
  );
  const afterDate = cleanLine(
    inlineDateMatch?.index !== undefined
      ? line.slice(inlineDateMatch.index + inlineDateMatch[0].length).replace(/^[|,()–—-]+\s*/g, "")
      : "",
  );
  const trailingLocationMatch = line.match(/[|,–—-]+\s*([A-Z][A-Z\s.'-]+,\s*[A-Z][A-Z\s.'-]+)\s*$/i);
  const inferredLocation =
    (looksLikeInlineLocation(afterDate) ? normalizeLocationLabel(afterDate) : null) ??
    normalizeLocationLabel(trailingLocationMatch?.[1] ?? null) ??
    companyContext?.location ?? null;
  const beforeParts = beforeDate
    .split(/\s+[–—-]\s+/)
    .map((part) => cleanLine(part))
    .filter(Boolean);

  if (beforeParts.length >= 2) {
    const trailingPart = beforeParts[beforeParts.length - 1] ?? "";
    const precedingPart = beforeParts[beforeParts.length - 2] ?? "";
    const trailingRole = extractTrailingRoleTitle(precedingPart);

    if (
      beforeParts.length >= 3 &&
      trailingRole &&
      !looksLikeRoleTitle(trailingPart)
    ) {
      const companyAndLocation = parseCompanyAndLocation(trailingPart);

      return {
        dateRange,
        companyName: companyAndLocation.companyName ?? companyContext?.companyName ?? null,
        location:
          companyAndLocation.location ??
          trailingRole.location ??
          inferredLocation,
        title: trailingRole.title,
      };
    }

    const first = beforeParts[0] ?? "";
    const remainder = cleanLine(beforeParts.slice(1).join(" - ")) || null;
    const companyFirst = !looksLikeRoleTitle(first) && looksLikeRoleTitle(remainder ?? "");
    const titleFirst = looksLikeRoleTitle(first) && !looksLikeRoleTitle(remainder ?? "");

    if (companyFirst) {
      const companyAndLocation = parseCompanyAndLocation(first);
      const repairedRemainder = extractTrailingRoleTitle(remainder ?? "");

      return {
        dateRange,
        companyName: companyAndLocation.companyName ?? companyContext?.companyName ?? null,
        location:
          companyAndLocation.location ??
          repairedRemainder?.location ??
          inferredLocation,
        title:
          repairedRemainder?.title ??
          (remainder ? normalizeHeadlineText(remainder) : null),
      };
    }

    if (titleFirst) {
      const companyAndLocation = parseCompanyAndLocation(remainder ?? "");

      return {
        dateRange,
        companyName: companyAndLocation.companyName ?? companyContext?.companyName ?? null,
        location: companyAndLocation.location ?? inferredLocation,
        title: normalizeHeadlineText(first) || null,
      };
    }

    const title = normalizeHeadlineText(beforeParts[0] ?? "") || null;
    const companyName = cleanLine(beforeParts.slice(1).join(" - ")) || companyContext?.companyName || null;
    const repairedTitle = extractTrailingRoleTitle(beforeDate);

    return {
      dateRange,
      companyName,
      location: repairedTitle?.location ?? inferredLocation,
      title:
        title && !hasPollutedTitleSignals(title)
          ? title
          : repairedTitle?.title ?? title,
    };
  }

  if (companyContext) {
    const repairedTitle = extractTrailingRoleTitle(beforeDate);

    return {
      dateRange,
      companyName: companyContext.companyName,
      location: repairedTitle?.location ?? companyContext.location,
      title:
        repairedTitle?.title ??
        (beforeDate ? normalizeHeadlineText(beforeDate) : null),
    };
  }

  const repairedTitle = extractTrailingRoleTitle(beforeDate);

  return {
    dateRange,
    companyName: null,
    location: repairedTitle?.location ?? inferredLocation,
    title:
      repairedTitle?.title ??
      (beforeDate ? normalizeHeadlineText(beforeDate) : null),
  };
}

function mergeWrappedDetailLines(lines: readonly string[]): string[] {
  const merged: string[] = [];

  for (const line of lines) {
    const cleaned = cleanLine(line.replace(/^[•*-]\s*/, ""));

    if (!cleaned) {
      continue;
    }

    const isBullet = /^[•*-]\s*/.test(line);

    if (isBullet || merged.length === 0) {
      merged.push(cleaned);
      continue;
    }

    merged[merged.length - 1] = cleanLine(`${merged[merged.length - 1]} ${cleaned}`);
  }

  return merged;
}

function splitExperienceBlocks(lines: readonly string[]): string[][] {
  const blocks: string[][] = [];
  let currentBlock: string[] = [];
  let pendingHeaderLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    if (line.length === 0 || /^experience$/i.test(line)) {
      pendingHeaderLines = [];
      continue;
    }

    const startsNewBlock = dateRangePattern.test(line);

    if (startsNewBlock) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
      }

      currentBlock = [...pendingHeaderLines.slice(-2), line];
      pendingHeaderLines = [];
      continue;
    }

    if (currentBlock.length > 0) {
      const nextLine = lines[index + 1] ?? "";
      const looksLikeUpcomingHeader =
        !/^[•*-]\s*/.test(line) &&
        line.length > 0 &&
        (isCompanyMarkerLine(line) || /\s+[–—-]\s+/.test(line) || looksLikeRoleTitle(line)) &&
        dateRangePattern.test(nextLine);

      if (looksLikeUpcomingHeader) {
        blocks.push(currentBlock);
        currentBlock = [];
        pendingHeaderLines = [...pendingHeaderLines.slice(-1), line];
        continue;
      }

      currentBlock.push(line);
      continue;
    }

    if (!/^[•*-]\s*/.test(line)) {
      pendingHeaderLines = [...pendingHeaderLines.slice(-2), line];
    }
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  return blocks.filter((block) => block.some((line) => dateRangePattern.test(line)));
}

function inferUndatedExperienceEntries(lines: readonly string[]) {
  const entries: Array<{
    companyName: string | null;
    companyUrl: null;
    title: string | null;
    employmentType: null;
    location: string | null;
    workMode: null;
    startDate: null;
    endDate: null;
    isCurrent: false;
    summary: string | null;
    achievements: string[];
    skills: string[];
    domainTags: string[];
    peopleManagementScope: null;
    ownershipScope: null;
  }> = [];

  for (let index = 0; index < lines.length - 1; index += 1) {
    const companyLine = cleanLine(lines[index] ?? "");
    const titleLine = cleanLine(lines[index + 1] ?? "");

    if (!companyLine || !titleLine) {
      continue;
    }

    if (
      /^[•*-]\s*/.test(companyLine) ||
      /^[•*-]\s*/.test(titleLine) ||
      looksLikeRoleTitle(companyLine) ||
      !looksLikeRoleTitle(titleLine)
    ) {
      continue;
    }

    const detailLines: string[] = [];
    let detailIndex = index + 2;

    while (detailIndex < lines.length) {
      const detailLine = cleanLine(lines[detailIndex] ?? "");

      if (!detailLine || (looksLikeRoleTitle(detailLine) && detailLines.length > 0)) {
        break;
      }

      if (/^[A-Z][A-Za-z0-9&.'()/-]+(?:\s+[A-Z][A-Za-z0-9&.'()/-]+){0,4}$/.test(detailLine) && looksLikeRoleTitle(cleanLine(lines[detailIndex + 1] ?? ""))) {
        break;
      }

      detailLines.push(detailLine);
      detailIndex += 1;
    }

    entries.push({
      companyName: companyLine,
      companyUrl: null,
      title: normalizeHeadlineText(titleLine) || null,
      employmentType: null,
      location: null,
      workMode: null,
      startDate: null,
      endDate: null,
      isCurrent: false,
      summary: detailLines[0] ?? null,
      achievements: uniqueStrings(detailLines.slice(1).filter((line) => line.length >= 24).slice(0, 6)),
      skills: inferSkills([companyLine, titleLine, ...detailLines].join("\n"), []),
      domainTags: [],
      peopleManagementScope: null,
      ownershipScope: null,
    });

    index = Math.max(index, detailIndex - 1);
  }

  return entries;
}

export function inferExperienceEntries(resumeText: string) {
  const sectionLines = normalizeExperienceSectionLines(
    findSectionBodyLinesByAliases(splitLines(resumeText), experienceSectionAliases),
  );
  const datedEntries = splitExperienceBlocks(sectionLines)
    .map((block) => {
      const companyContext = isCompanyMarkerLine(block[0] ?? "") ? parseCompanyMarker(block[0] ?? "") : null;
      const normalizedBlock = block.map((line) => cleanLine(line)).filter(Boolean);
      const dateLineIndex = normalizedBlock.findIndex((line) => dateRangePattern.test(line));
      const dateLine = dateLineIndex === -1 ? (companyContext ? (normalizedBlock[1] ?? "") : (normalizedBlock[0] ?? "")) : (normalizedBlock[dateLineIndex] ?? "");
      const headerContextLines = normalizedBlock.slice(0, dateLineIndex === -1 ? 1 : dateLineIndex);
      const nonMarkerHeaderLine = [...headerContextLines].reverse().find((line) => !isCompanyMarkerLine(line)) ?? null;
      const headerLine = companyContext
        ? (nonMarkerHeaderLine ?? dateLine)
        : (headerContextLines[headerContextLines.length - 1] ?? normalizedBlock[0] ?? "");
      const header = parseExperienceHeader(headerLine, dateLine, companyContext);
      const rawDetailLines = block
        .slice(Math.max(companyContext ? 2 : 1, dateLineIndex === -1 ? (companyContext ? 2 : 1) : dateLineIndex + 1))
        .filter((line) => line.length > 0 && !isCompanyMarkerLine(line));
      const detailLines = mergeWrappedDetailLines(rawDetailLines);
      const firstDetailIsBullet = /^[•*-]\s*/.test(rawDetailLines[0] ?? "");
      const summaryLine = !firstDetailIsBullet ? (detailLines[0] ?? null) : null;
      const achievementLines = summaryLine ? detailLines.slice(1) : detailLines;

      return {
        companyName: header.companyName,
        companyUrl: null,
        title: header.title,
        employmentType: null,
        location: header.location,
        workMode: null,
        startDate: header.dateRange.startDate,
        endDate: header.dateRange.endDate,
        isCurrent: header.dateRange.isCurrent,
        summary: summaryLine,
        achievements: uniqueStrings(achievementLines.filter((line) => line.length >= 24).slice(0, 6)),
        skills: inferSkills(block.join("\n"), []),
        domainTags: [],
        peopleManagementScope: null,
        ownershipScope: null,
      };
    })
    .filter((entry) => entry.title || entry.companyName || entry.summary);

  if (datedEntries.length > 0) {
    return datedEntries;
  }

  return inferUndatedExperienceEntries(sectionLines).filter(
    (entry) => entry.title || entry.companyName || entry.summary,
  );
}
