import type {
  ResumeDocumentBundle,
  ResumeImportFieldCandidate,
  ResumeImportFieldCandidateDraft,
} from "@unemployed/contracts";

import { toCandidate } from "./resume-import-candidate-utils";
import { isClearlyResumeDateRange } from "./resume-import-common";

function normalizeEmail(value: string): string | null {
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

function cleanLocationCandidate(value: string): string | null {
  const trimmed = value.trim();
  const withoutPrefix = trimmed.replace(/^Address:\s*/i, "");
  const withoutSuffix = withoutPrefix.replace(/\s*\([^)]*\)\s*$/u, "");
  return withoutSuffix.trim() || null;
}

function isLikelyNameToken(value: string): boolean {
  return /^[A-Z][A-Za-z.'-]*$/.test(value) || /^[A-Z]{2,}$/.test(value);
}

const nonNamePhrasePattern =
  /\b(software|engineer|developer|designer|manager|director|analyst|consultant|specialist|architect|consulting|technical|mentorship|leadership|performance|productivity|quality|security|platform|platforms|systems|cloud|devops|support|experience|summary|profile|skills|project|projects|work|professional|staff|senior|principal|lead|frontend|backend|full-stack|scale)\b/i;

function trimTrailingContactFragments(value: string): string {
  return (
    cleanLocationCandidate(value.split(/\s*[·|]\s*/)[0] ?? value)
      ?.replace(
        /\s+(?:\(?\+?\d[\d\s().-]{7,}\d\)?|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|https?:\/\/\S+|(?:www\.)?(?:linkedin|github)\.com\/\S+)$/i,
        "",
      )
      .trim() ?? ""
  );
}

function extractNameFromHeaderLine(line: string): string | null {
  const cleaned = line.trim().replace(/\s+/g, " ");
  const tokens = cleaned.split(/\s+/).filter(Boolean);

  for (
    let tokenCount = 2;
    tokenCount <= Math.min(4, tokens.length);
    tokenCount += 1
  ) {
    const candidate = tokens.slice(0, tokenCount).join(" ");
    const remainder = tokens.slice(tokenCount).join(" ").trim();

    if (!candidate || !remainder) {
      continue;
    }

    const isName =
      candidate.length <= 48 &&
      !nonNamePhrasePattern.test(candidate) &&
      candidate.split(/\s+/).every(isLikelyNameToken);

    if (!isName) {
      continue;
    }

    if (
      /^\+?\d/.test(remainder) ||
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(remainder) ||
      /(?:https?:\/\/|(?:www\.)?(?:linkedin|github)\.com\/)/i.test(remainder) ||
      isLikelyLocationValue(trimTrailingContactFragments(remainder))
    ) {
      return candidate;
    }
  }

  return null;
}

function extractLocationFromHeaderLine(
  line: string,
  fullName: string | null,
): string | null {
  let candidate = line.trim().replace(/\s+/g, " ");

  if (fullName) {
    const escapedName = fullName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    candidate = candidate.replace(new RegExp(`^${escapedName}\\s+`, "i"), "");
  }

  candidate = trimTrailingContactFragments(candidate);

  const match = candidate.match(
    /([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)*,\s*(?:[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?|[A-Za-z][A-Za-z\s.'-]+))$/,
  );

  return cleanLocationCandidate(match?.[1] ?? candidate);
}

function isLikelyPersonName(value: string): boolean {
  const trimmed = value.trim();

  if (!trimmed || trimmed.length > 48) {
    return false;
  }

  if (/[@\d]|https?:\/\//i.test(trimmed)) {
    return false;
  }

  if (
    /(about me|about|summary|profile|skills|experience|education|language skills|work experience)/i.test(
      trimmed,
    )
  ) {
    return false;
  }

  if (nonNamePhrasePattern.test(trimmed)) {
    return false;
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  return (
    parts.length >= 2 &&
    parts.length <= 4 &&
    /^[A-Za-z][A-Za-z\s.'-]+$/.test(trimmed) &&
    parts.every(isLikelyNameToken)
  );
}

function isLikelyLocationValue(value: string): boolean {
  const cleaned = cleanLocationCandidate(value);

  if (!cleaned || cleaned.length > 80) {
    return false;
  }

  if (/[@]|https?:\/\//i.test(cleaned)) {
    return false;
  }

  if (/[.!?]/.test(cleaned)) {
    return false;
  }

  if (
    /\b(recently|decided|return|passion|experience|building|driven|improving)\b/i.test(
      cleaned,
    )
  ) {
    return false;
  }

  return (
    /^[A-Za-z][A-Za-z\s.'-]+,\s*[A-Za-z][A-Za-z\s.'-]+$/.test(cleaned) ||
    /^[A-Za-z][A-Za-z\s.'-]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/.test(
      cleaned,
    ) ||
    /^[A-Za-z][A-Za-z\s.'-]+\s+[A-Z]{2}\s+\d{5}(?:-\d{4})?$/.test(cleaned)
  );
}

function isLinkedInUrl(url: string): boolean {
  return /(?:https?:\/\/)?(?:www\.)?linkedin\.com\//i.test(url);
}

function isGithubUrl(url: string): boolean {
  return /(?:https?:\/\/)?(?:www\.)?github\.com\//i.test(url);
}

function isPortfolioUrl(url: string): boolean {
  return /(?:https?:\/\/)?(?:www\.)?(?:behance\.net|dribbble\.com)\//i.test(
    url,
  );
}

function isPersonalWebsiteUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) {
    return false;
  }

  return !isLinkedInUrl(url) && !isGithubUrl(url) && !isPortfolioUrl(url);
}

function extractHeaderWorkModes(documentBundle: ResumeDocumentBundle): {
  modes: Array<"remote" | "hybrid" | "onsite" | "flexible">;
  evidenceLines: string[];
  sourceBlockIds: string[];
} {
  const sectionHeadingPattern =
    /^(?:summary|profile|experience|work experience|employment|education|skills|projects?|certifications?|languages?)\s*:?$/i;
  const headerBlocks = [...documentBundle.blocks]
    .sort((left, right) => left.readingOrder - right.readingOrder)
    .slice(0, 12);
  const modes: Array<"remote" | "hybrid" | "onsite" | "flexible"> = [];
  const evidenceLines: string[] = [];
  const sourceBlockIds: string[] = [];
  let reachedBody = false;
  for (const block of headerBlocks) {
    for (const rawLine of block.text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (sectionHeadingPattern.test(line)) {
        reachedBody = true;
        break;
      }
      const negated =
        /\b(?:not|no|never|without|avoid(?:ing)?|exclude(?:d|s|ing)?|unavailable)\b.{0,30}\b(?:remote|hybrid|on[- ]?site|flexible)\b/i.test(
          line,
        ) ||
        /\b(?:remote|hybrid|on[- ]?site|flexible)\b.{0,30}\b(?:not|never|unavailable|excluded)\b/i.test(
          line,
        );
      if (negated) continue;

      const matched: Array<"remote" | "hybrid" | "onsite" | "flexible"> = [];
      if (
        /^remote(?:[- ]first)?(?:\b|[,|])/i.test(line) ||
        /[|,]\s*remote(?:[- ]first)?\b/i.test(line) ||
        /\b(?:seeking|open to|prefer(?:red|ring)?|looking for)\s+(?:a\s+)?remote\b/i.test(
          line,
        ) ||
        /\bremote[- ](?:role|work|position|workplace|arrangement)s?\b/i.test(
          line,
        )
      ) {
        matched.push("remote");
      }
      if (
        /^hybrid(?:\b|[,|])/i.test(line) ||
        /\b(?:seeking|open to|prefer(?:red|ring)?|looking for)\s+(?:a\s+)?hybrid\b/i.test(
          line,
        ) ||
        /\bhybrid[- ](?:role|work|position|workplace|arrangement)s?\b/i.test(
          line,
        )
      ) {
        matched.push("hybrid");
      }
      if (
        /^on[- ]?site(?:\b|[,|])/i.test(line) ||
        /\b(?:seeking|open to|prefer(?:red|ring)?|looking for)\s+(?:an?\s+)?on[- ]?site\b/i.test(
          line,
        ) ||
        /\bon[- ]?site[- ](?:role|work|position|workplace|arrangement)s?\b/i.test(
          line,
        )
      ) {
        matched.push("onsite");
      }
      if (
        /^flexible$/i.test(line) ||
        /\bflexible[- ](?:work|location|work mode|arrangement|role|position)s?\b/i.test(
          line,
        ) ||
        /\b(?:seeking|open to|prefer(?:red|ring)?|looking for)\s+(?:a\s+)?flexible\s+(?:work|location|arrangement|role|position)/i.test(
          line,
        )
      ) {
        matched.push("flexible");
      }
      if (matched.length > 0) {
        modes.push(...matched);
        evidenceLines.push(line);
        sourceBlockIds.push(block.id);
      }
    }
    if (reachedBody) break;
  }
  return {
    modes: [...new Set(modes)],
    evidenceLines: [...new Set(evidenceLines)],
    sourceBlockIds: [...new Set(sourceBlockIds)],
  };
}

export function extractLiteralCandidates(
  runId: string,
  documentBundle: ResumeDocumentBundle,
  createdAt: string,
): ResumeImportFieldCandidate[] {
  const text = documentBundle.fullText ?? "";
  const drafts: ResumeImportFieldCandidateDraft[] = [];
  const nameBlock = documentBundle.blocks
    .slice(0, 8)
    .find((block) => isLikelyPersonName(block.text));
  const emailMatches =
    text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  const phoneMatches =
    text.match(
      /(\(?\+?\d[\d\s().-]{5,}\d\)?(?:\s*(?:ext\.?|x)\s*\d{1,6})?)/gi,
    ) ?? [];
  const urlMatches = text.match(/https?:\/\/[^\s)]+/gi) ?? [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstBlockId = documentBundle.blocks[0]?.id;
  const literalName =
    nameBlock?.text ??
    lines
      .slice(0, 12)
      .map((line) => extractNameFromHeaderLine(line))
      .find(Boolean) ??
    lines.find((line) => isLikelyPersonName(line)) ??
    null;
  const inlineLocation =
    lines
      .slice(0, 12)
      .map((line) => extractLocationFromHeaderLine(line, literalName))
      .find((line) => line && isLikelyLocationValue(line)) ?? null;
  const locationLine =
    inlineLocation ??
    lines.find(
      (line) => /^Address:/i.test(line) && isLikelyLocationValue(line),
    ) ??
    lines.find((line) => isLikelyLocationValue(line)) ??
    null;

  if (literalName) {
    const normalizedName = literalName.trim();
    drafts.push({
      target: { section: "identity", key: "fullName", recordId: null },
      label: "Full name",
      value: normalizedName,
      normalizedValue: normalizedName,
      valuePreview: normalizedName,
      evidenceText:
        normalizedName.length > 400
          ? `${normalizedName.slice(0, 400)}...`
          : normalizedName,
      sourceBlockIds: nameBlock
        ? [nameBlock.id]
        : firstBlockId
          ? [firstBlockId]
          : [],
      confidence: 0.99,
      notes: [],
      alternatives: [],
    });
  }

  const email = normalizeEmail(emailMatches[0] ?? "");
  if (email) {
    drafts.push({
      target: { section: "contact", key: "email", recordId: null },
      label: "Email",
      value: email,
      normalizedValue: email,
      valuePreview: email,
      evidenceText: email,
      sourceBlockIds: documentBundle.blocks
        .filter((block) => block.text.includes(email))
        .map((block) => block.id),
      confidence: 0.99,
      notes: [],
      alternatives: [],
    });
  }

  const phone = phoneMatches
    .find((value) => !isClearlyResumeDateRange(value))
    ?.trim();
  if (phone) {
    drafts.push({
      target: { section: "contact", key: "phone", recordId: null },
      label: "Phone",
      value: phone,
      normalizedValue: phone,
      valuePreview: phone,
      evidenceText: phone,
      sourceBlockIds: documentBundle.blocks
        .filter((block) => block.text.includes(phone))
        .map((block) => block.id),
      confidence: 0.96,
      notes: [],
      alternatives: [],
    });
  }

  if (locationLine) {
    const normalizedLocation = cleanLocationCandidate(locationLine);

    if (normalizedLocation) {
      drafts.push({
        target: { section: "location", key: "currentLocation", recordId: null },
        label: "Current location",
        value: normalizedLocation,
        normalizedValue: normalizedLocation,
        valuePreview: normalizedLocation,
        evidenceText: normalizedLocation,
        sourceBlockIds: documentBundle.blocks
          .filter((block) => block.text.includes(locationLine))
          .map((block) => block.id),
        confidence: 0.88,
        notes: [],
        alternatives: [],
      });
    }
  }

  const headerWorkMode = extractHeaderWorkModes(documentBundle);
  if (headerWorkMode.modes.length > 0) {
    drafts.push({
      target: {
        section: "search_preferences",
        key: "workModes",
        recordId: null,
      },
      label: "Work mode",
      value: headerWorkMode.modes,
      normalizedValue: headerWorkMode.modes,
      valuePreview: headerWorkMode.modes.join(", "),
      evidenceText: headerWorkMode.evidenceLines.join(" "),
      sourceBlockIds: headerWorkMode.sourceBlockIds,
      confidence: 0.99,
      notes: ["explicit_header_work_mode"],
      alternatives: [],
    });
  }

  const urlTargets: Array<{
    key: ResumeImportFieldCandidateDraft["target"]["key"];
    label: string;
    matches: (url: string) => boolean;
  }> = [
    { key: "linkedinUrl", label: "LinkedIn URL", matches: isLinkedInUrl },
    { key: "githubUrl", label: "GitHub URL", matches: isGithubUrl },
    { key: "portfolioUrl", label: "Portfolio URL", matches: isPortfolioUrl },
    {
      key: "personalWebsiteUrl",
      label: "Personal website",
      matches: isPersonalWebsiteUrl,
    },
  ];
  const usedUrls = new Set<string>();

  for (const target of urlTargets) {
    const url = urlMatches.find(
      (entry) => !usedUrls.has(entry) && target.matches(entry),
    );
    if (!url) {
      continue;
    }

    usedUrls.add(url);

    drafts.push({
      target: { section: "contact", key: target.key, recordId: null },
      label: target.label,
      value: url,
      normalizedValue: url,
      valuePreview: url,
      evidenceText: url,
      sourceBlockIds: documentBundle.blocks
        .filter((block) => block.text.includes(url))
        .map((block) => block.id),
      confidence: 0.95,
      notes: [],
      alternatives: [],
    });
  }

  return drafts.map((draft, index) =>
    toCandidate(
      documentBundle,
      runId,
      "parser_literal",
      createdAt,
      draft,
      index,
    ),
  );
}
