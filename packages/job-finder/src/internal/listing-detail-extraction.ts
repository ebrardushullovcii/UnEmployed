/**
 * Reads the body of a job listing out of its own page HTML, without a browser.
 *
 * Source-generic on purpose (ADR 0007): the reader knows schema.org, Open
 * Graph, and ordinary HTML, never a board. Most job pages carry a full
 * `JobPosting` record as JSON-LD in the initial HTML because search engines
 * require it; that record is the same data a card-only scan never saw
 * (description, pay, location, posting date). When a page has no record, the
 * reader falls back to the visible text of the page and says so.
 */

const MAX_HTML_LENGTH = 1_500_000;
const MAX_DESCRIPTION_LENGTH = 24_000;
const MAX_PAGE_TEXT_LENGTH = 12_000;
const MIN_PAGE_TEXT_WORDS = 120;
const MAX_JSON_LD_NODES = 200;

export type ListingDetailExtractionMethod = "json_ld" | "page_text";

export interface ExtractedListingDetail {
  method: ListingDetailExtractionMethod;
  title: string | null;
  company: string | null;
  location: string | null;
  /** Plain text with paragraphs separated by blank lines and "• " bullets. */
  description: string;
  salaryText: string | null;
  employmentType: string | null;
  /** ISO timestamp when the record carried a parseable posting date. */
  postedAt: string | null;
  validThrough: string | null;
  workModeHints: string[];
  directApplyUrl: string | null;
}

export interface ExtractListingDetailInput {
  html: string;
  url: string;
  /** The title the card carried; used to pick among several records. */
  expectedTitle?: string | null;
}

/**
 * Extracts the listing body from page HTML. Returns null when the page has
 * neither a JobPosting record nor enough readable text to stand in for one.
 */
export function extractListingDetailFromHtml(
  input: ExtractListingDetailInput,
): ExtractedListingDetail | null {
  const html =
    input.html.length > MAX_HTML_LENGTH
      ? input.html.slice(0, MAX_HTML_LENGTH)
      : input.html;

  const structured = extractJobPostingFromJsonLd(html, input);
  if (structured) {
    return structured;
  }

  return extractListingDetailFromPageText(html, input);
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const scriptPattern =
    /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/giu;
  for (const match of html.matchAll(scriptPattern)) {
    const raw = match[1]?.trim();
    if (!raw) {
      continue;
    }
    const parsed = parseLenientJson(raw);
    if (parsed !== undefined) {
      blocks.push(parsed);
    }
  }
  return blocks;
}

function parseLenientJson(raw: string): unknown {
  // Some pages wrap the payload in an HTML comment or leave a trailing comma;
  // strip the common wrappers before giving up on the block.
  const candidates = [
    raw,
    raw.replace(/^<!--/u, "").replace(/-->$/u, "").trim(),
    raw.replace(/,\s*([}\]])/gu, "$1"),
  ];
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // try the next shape
    }
  }
  return undefined;
}

function hasType(node: JsonRecord, typeName: string): boolean {
  const type = node["@type"];
  if (typeof type === "string") {
    return type.toLowerCase() === typeName.toLowerCase();
  }
  if (Array.isArray(type)) {
    return type.some(
      (entry) =>
        typeof entry === "string" &&
        entry.toLowerCase() === typeName.toLowerCase(),
    );
  }
  return false;
}

function collectJobPostingNodes(blocks: readonly unknown[]): JsonRecord[] {
  const found: JsonRecord[] = [];
  const queue: unknown[] = [...blocks];
  let visited = 0;
  while (queue.length > 0 && visited < MAX_JSON_LD_NODES) {
    const node = queue.shift();
    visited += 1;
    if (Array.isArray(node)) {
      queue.push(...(node as unknown[]));
      continue;
    }
    if (!isRecord(node)) {
      continue;
    }
    if (hasType(node, "JobPosting")) {
      found.push(node);
      continue;
    }
    for (const key of ["@graph", "mainEntity", "itemListElement", "item"]) {
      const child = node[key];
      if (child !== undefined) {
        queue.push(child);
      }
    }
  }
  return found;
}

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = collapseWhitespace(decodeHtmlEntities(value));
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (isRecord(value)) {
    return readString(value.name ?? value["@value"] ?? value.text ?? null);
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const read = readString(entry);
      if (read) {
        return read;
      }
    }
  }
  return null;
}

function readOrganizationName(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const name = readOrganizationName(entry);
      if (name) {
        return name;
      }
    }
    return null;
  }
  if (isRecord(value)) {
    return readString(value.name ?? value.legalName ?? null);
  }
  return readString(value);
}

function readLocation(node: JsonRecord): {
  location: string | null;
  workModeHints: string[];
} {
  const hints: string[] = [];
  const locationType = readString(node.jobLocationType);
  if (locationType && /telecommute|remote/iu.test(locationType)) {
    hints.push("remote");
  }

  const places: string[] = [];
  const jobLocation = node.jobLocation;
  const entries = Array.isArray(jobLocation) ? jobLocation : [jobLocation];
  for (const entry of entries) {
    if (!isRecord(entry)) {
      const plain = readString(entry);
      if (plain) {
        places.push(plain);
      }
      continue;
    }
    const address = isRecord(entry.address) ? entry.address : entry;
    const parts = [
      readString(address.addressLocality),
      readString(address.addressRegion),
      readString(address.addressCountry),
    ].filter((part): part is string => Boolean(part));
    const label = parts.length > 0 ? parts.join(", ") : readString(entry.name);
    if (label) {
      places.push(label);
    }
  }

  if (places.length === 0 && hints.includes("remote")) {
    const requirement = node.applicantLocationRequirements;
    const requirementEntries = Array.isArray(requirement)
      ? requirement
      : [requirement];
    const regions = requirementEntries
      .map((entry) => readString(entry))
      .filter((entry): entry is string => Boolean(entry));
    if (regions.length > 0) {
      places.push(`Remote (${regions.slice(0, 3).join(", ")})`);
    } else {
      places.push("Remote");
    }
  }

  // "Austin, Texas, United States" already says "United States": a broader
  // place that is contained in a more specific one adds nothing.
  const unique = [...new Set(places)].filter(
    (place, _index, all) =>
      !all.some(
        (other) =>
          other !== place && other.toLowerCase().includes(place.toLowerCase()),
      ),
  );
  return {
    location: unique.length > 0 ? unique.slice(0, 3).join(" · ") : null,
    workModeHints: hints,
  };
}

function formatAmount(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString("en-US")
    : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function readSalary(node: JsonRecord): string | null {
  const salary = node.baseSalary ?? node.estimatedSalary;
  const entry: unknown = Array.isArray(salary)
    ? (salary as unknown[])[0]
    : salary;
  if (!isRecord(entry)) {
    return readString(entry);
  }
  const currency = readString(entry.currency) ?? "";
  const value = isRecord(entry.value) ? entry.value : entry;
  const toNumber = (candidate: unknown): number | null => {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
    if (typeof candidate === "string") {
      const parsed = Number(candidate.replace(/[^0-9.]/gu, ""));
      return Number.isFinite(parsed) && candidate.trim() !== "" ? parsed : null;
    }
    return null;
  };
  const min = toNumber(value.minValue);
  const max = toNumber(value.maxValue);
  const single = toNumber(value.value);
  const unit = readString(value.unitText);
  const unitLabel = unit
    ? ({ HOUR: "hour", DAY: "day", WEEK: "week", MONTH: "month", YEAR: "year" }[
        unit.toUpperCase()
      ] ?? unit.toLowerCase())
    : null;

  let range: string | null = null;
  if (min !== null && max !== null && max !== min) {
    range = `${formatAmount(min)} – ${formatAmount(max)}`;
  } else if (min !== null || max !== null || single !== null) {
    range = formatAmount((single ?? min ?? max) as number);
  }
  if (!range) {
    return null;
  }
  return `${currency ? `${currency} ` : ""}${range}${unitLabel ? ` / ${unitLabel}` : ""}`;
}

function readIsoDate(value: unknown): string | null {
  const raw = readString(value);
  if (!raw) {
    return null;
  }
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function readEmploymentType(value: unknown): string | null {
  const raw = Array.isArray(value)
    ? value
        .map((entry) => readString(entry))
        .filter(Boolean)
        .join(", ")
    : readString(value);
  if (!raw) {
    return null;
  }
  return raw
    .split(/\s*,\s*/u)
    .map((part) =>
      part
        .toLowerCase()
        .replace(/_/gu, "-")
        .replace(/\b([a-z])/gu, (match) => match.toUpperCase()),
    )
    .join(", ");
}

function readDirectApplyUrl(node: JsonRecord): string | null {
  const url = readString(node.url) ?? null;
  const directApply = node.directApply;
  return directApply === true && url ? url : null;
}

function scoreTitleMatch(
  candidate: string | null,
  expected: string | null | undefined,
): number {
  if (!candidate || !expected) {
    return 0;
  }
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, " ")
      .trim();
  const left = normalize(candidate);
  const right = normalize(expected);
  if (left === right) {
    return 3;
  }
  if (left.includes(right) || right.includes(left)) {
    return 2;
  }
  const leftTokens = new Set(left.split(" "));
  const shared = right.split(" ").filter((token) => leftTokens.has(token));
  return shared.length >= 2 ? 1 : 0;
}

function extractJobPostingFromJsonLd(
  html: string,
  input: ExtractListingDetailInput,
): ExtractedListingDetail | null {
  const nodes = collectJobPostingNodes(readJsonLdBlocks(html));
  if (nodes.length === 0) {
    return null;
  }

  const ranked = nodes
    .map((node) => ({
      node,
      score: scoreTitleMatch(readString(node.title), input.expectedTitle),
      descriptionLength: (readString(node.description) ?? "").length,
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.descriptionLength - left.descriptionLength,
    );
  const node = ranked[0]?.node;
  if (!node) {
    return null;
  }

  const descriptionHtml =
    typeof node.description === "string" ? node.description : "";
  const description = truncateText(
    htmlToPlainText(descriptionHtml),
    MAX_DESCRIPTION_LENGTH,
  );
  if (!description) {
    return null;
  }

  const { location, workModeHints } = readLocation(node);
  const combinedHints = [
    ...workModeHints,
    ...detectWorkModeHints(`${readString(node.title) ?? ""} ${description}`),
  ];

  return {
    method: "json_ld",
    title: readString(node.title),
    company: readOrganizationName(node.hiringOrganization),
    location,
    description,
    salaryText: readSalary(node),
    employmentType: readEmploymentType(node.employmentType),
    postedAt: readIsoDate(node.datePosted),
    validThrough: readIsoDate(node.validThrough),
    workModeHints: [...new Set(combinedHints)],
    directApplyUrl: readDirectApplyUrl(node),
  };
}

// ---------------------------------------------------------------------------
// Page text fallback
// ---------------------------------------------------------------------------

function readMetaContent(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const patterns = [
    new RegExp(
      `<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${escaped}["'][^>]*content\\s*=\\s*["']([^"']*)["']`,
      "iu",
    ),
    new RegExp(
      `<meta\\b[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${escaped}["']`,
      "iu",
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const value = collapseWhitespace(decodeHtmlEntities(match[1]));
      if (value) {
        return value;
      }
    }
  }
  return null;
}

const LISTING_BODY_SIGNAL =
  /\b(responsibilit|requirement|qualification|what you.ll do|what you will do|about (?:the|this) role|about you|who you are|experience|skills|benefits|compensation|salary)\b/iu;

function extractListingDetailFromPageText(
  html: string,
  input: ExtractListingDetailInput,
): ExtractedListingDetail | null {
  const bodyHtml = selectMainContentHtml(html);
  const text = truncateText(htmlToPlainText(bodyHtml), MAX_PAGE_TEXT_LENGTH);
  const wordCount = text.split(/\s+/u).filter(Boolean).length;
  if (wordCount < MIN_PAGE_TEXT_WORDS || !LISTING_BODY_SIGNAL.test(text)) {
    return null;
  }

  const title =
    readMetaContent(html, "og:title") ??
    (html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1]
      ? collapseWhitespace(
          decodeHtmlEntities(
            html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1] ?? "",
          ),
        )
      : null);

  return {
    method: "page_text",
    title:
      title && scoreTitleMatch(title, input.expectedTitle) > 0 ? title : null,
    company: null,
    location: null,
    description: text,
    salaryText: null,
    employmentType: null,
    postedAt: null,
    validThrough: null,
    workModeHints: detectWorkModeHints(text),
    directApplyUrl: null,
  };
}

function selectMainContentHtml(html: string): string {
  const stripped = html
    .replace(/<script\b[\s\S]*?<\/script\s*>/giu, " ")
    .replace(/<style\b[\s\S]*?<\/style\s*>/giu, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript\s*>/giu, " ")
    .replace(
      /<(?:nav|header|footer|aside)\b[\s\S]*?<\/(?:nav|header|footer|aside)\s*>/giu,
      " ",
    );
  for (const tag of ["main", "article"]) {
    const match = stripped.match(
      new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, "iu"),
    );
    if (match?.[1] && match[1].length > 400) {
      return match[1];
    }
  }
  const body = stripped.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/iu);
  return body?.[1] ?? stripped;
}

// ---------------------------------------------------------------------------
// HTML → text
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  bull: "•",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
  eacute: "é",
  egrave: "è",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
};

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/giu, (_match, hex: string) =>
      safeFromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/gu, (_match, decimal: string) =>
      safeFromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&([a-z]+);/giu, (match, name: string) => {
      const replacement = NAMED_ENTITIES[name.toLowerCase()];
      return replacement ?? match;
    });
}

function safeFromCodePoint(codePoint: number): string {
  try {
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
  } catch {
    return "";
  }
}

/**
 * Converts listing HTML into readable plain text: block elements become line
 * breaks, list items become bullets, everything else is stripped. The result
 * keeps the paragraph rhythm the scorer's requirement detection relies on.
 */
export function htmlToPlainText(html: string): string {
  if (!html) {
    return "";
  }
  // A description that is already plain text (no tags) still needs entities
  // decoded and whitespace settled; the same pipeline handles both.
  const withBreaks = html
    .replace(/<script\b[\s\S]*?<\/script\s*>/giu, " ")
    .replace(/<style\b[\s\S]*?<\/style\s*>/giu, " ")
    .replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/<\s*br\s*\/?>/giu, "\n")
    .replace(/<\s*li\b[^>]*>/giu, "\n• ")
    .replace(
      /<\s*\/\s*(?:p|div|li|ul|ol|h[1-6]|tr|section|article|blockquote|dd|dt)\s*>/giu,
      "\n\n",
    )
    .replace(
      /<\s*(?:p|div|h[1-6]|tr|section|article|blockquote|dd|dt)\b[^>]*>/giu,
      "\n",
    )
    .replace(/<\s*t[dh]\b[^>]*>/giu, " ")
    .replace(/<[^>]+>/gu, " ");
  const decoded = decodeHtmlEntities(withBreaks);
  return decoded
    .replace(/\u00a0/gu, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/gu, " ").trim())
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  const cut = value.slice(0, maxLength);
  const lastBreak = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(". "));
  return `${cut.slice(0, lastBreak > maxLength * 0.6 ? lastBreak : maxLength).trimEnd()}…`;
}

function detectWorkModeHints(text: string): string[] {
  const normalized = text.toLowerCase();
  const hints: string[] = [];
  if (/\bremote\b|work\s+from\s+home/u.test(normalized)) {
    hints.push("remote");
  }
  if (/\bhybrid\b/u.test(normalized)) {
    hints.push("hybrid");
  }
  if (/\bon[- ]?site\b|\bin[- ]office\b|\bin\s+office\b/u.test(normalized)) {
    hints.push("onsite");
  }
  return hints;
}
