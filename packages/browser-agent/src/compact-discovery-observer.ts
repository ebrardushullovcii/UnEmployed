import type { Page } from "playwright";
import { z } from "zod";
import {
  DISCOVERY_OBSERVATION_ACCESSIBILITY_SUMMARY_MAX,
  DISCOVERY_OBSERVATION_ACTION_CANDIDATES_MAX,
  DISCOVERY_OBSERVATION_LABEL_MAX,
  DISCOVERY_OBSERVATION_PAGINATION_CANDIDATES_MAX,
  DISCOVERY_OBSERVATION_POSTING_CANDIDATES_MAX,
  DISCOVERY_OBSERVATION_TEXT_SAMPLE_MAX,
  DISCOVERY_OBSERVATION_UNCERTAINTY_NOTES_MAX,
  DiscoveryCompactObservationSchema,
  JobPostingSchema,
  formatEmployerLabelFromSlug,
  sanitizeObservedEmployerLabel,
  type DiscoveryCompactObservation,
  type DiscoveryCompactObservationUnsupportedReason,
  type JobPosting,
} from "@unemployed/contracts";

import { isLikelySiteUtilityJob } from "./agent/job-extraction";

// ---------------------------------------------------------------------------
// Deterministic compact-snapshot discovery observer (ADR 0013, tier two)
//
// One capture produces exactly one schema-validated `DiscoveryCompactObservation`:
// either a supported observation with bounded page summaries, typed posting
// candidates, and snapshot-scoped pagination/action references, or an explicit
// unsupported outcome. The adapter is source-generic: no board-specific
// selectors or policy, no raw HTML/selectors/handles cross the boundary, and
// nothing assumes a listing line shape or a minimum content-length gate.
//
// The production run loop invokes this as its deterministic first observation;
// budgets, persistence, fallback, and follow-up ownership stay with orchestration.
// ---------------------------------------------------------------------------

/** Hard scan ceiling for list-item/card containers read from one page. */
const MAX_SCAN_CONTAINERS = 150;

/** Hard scan ceiling for interactive elements read from one page. */
const MAX_SCAN_ELEMENTS = 400;

/** Hard scan ceiling for JSON-LD JobPosting records read from one page. */
const MAX_SCAN_STRUCTURED_POSTINGS = 60;

/** Maximum text lines retained per scanned card container. */
const MAX_SCAN_LINES_PER_CONTAINER = 12;

/** Character cap applied to every scanned text line before it crosses back. */
const MAX_SCAN_LINE_CHARS = 200;

/** Character cap applied to extracted posting descriptions. */
const POSTING_DESCRIPTION_MAX_CHARS = 800;

/**
 * Input for one deterministic capture. The caller owns observation identity:
 * `observationId` identifies the capture, `revision` is the caller's monotonic
 * per-target sequence (starting at 1), and `observedAt` fixes the capture time
 * so observations stay deterministic and replayable.
 */
export interface CaptureCompactDiscoveryObservationInput {
  page: Page;
  targetId: string;
  observationId: string;
  revision: number;
  /** ISO-8601 datetime (`Z`) stamped onto the observation and candidates. */
  observedAt: string;
  options?: CompactDiscoveryObserverOptions;
}

/**
 * Bounded capture knobs. Every value is clamped into the contract constants;
 * callers cannot widen bounds beyond what the observation schema accepts.
 */
export interface CompactDiscoveryObserverOptions {
  /** Visible-text sample cap in characters (clamped to the contract max). */
  textSampleMaxChars?: number;
  /** Accessibility-summary cap in characters (clamped to the contract max). */
  accessibilitySummaryMaxChars?: number;
  /** Posting candidate cap (clamped to the contract max). */
  postingCandidatesMax?: number;
  /** Pagination candidate cap (clamped to the contract max). */
  paginationCandidatesMax?: number;
  /** Action candidate cap (clamped to the contract max). */
  actionCandidatesMax?: number;
}

// ---------------------------------------------------------------------------
// Scan payloads (the only shapes crossing the Playwright evaluate boundary)
// ---------------------------------------------------------------------------

/** One interactive element as read generically from the page. */
export interface ScannedInteractiveElement {
  /** Resolved ARIA/tag role, e.g. `link`, `button`. Never a selector. */
  role: string;
  /** Accessible name computed generically (see priority in the scanner). */
  accessibleName: string;
  /** Absolute http(s) href for links, otherwise null. */
  href: string | null;
  /** Opaque ordinal grouping token for the enclosing card container. */
  containerKey: string | null;
  /** Generic job-id attribute hint (`data-job-id` family) when present. */
  jobIdHint: string | null;
  /**
   * Absolute `/company/{slug}` href recovered from the element or a unique
   * company-scoped ancestor. Used when boards render job rows as plain divs
   * without semantic listitem/article containers.
   */
  companyHref: string | null;
  /** Visible company name from the bound profile anchor when present. */
  companyLabel: string | null;
}

/** Text evidence collected once per scanned card container. */
export interface ScannedCardContainer {
  key: string;
  headingText: string | null;
  lines: string[];
  easyApplyHint: boolean;
  /** Absolute `/company/{slug}` href observed inside the container, when present. */
  companyHref: string | null;
  /** Visible company name from the bound profile anchor when present. */
  companyLabel: string | null;
}

/** Normalized JSON-LD JobPosting record as read from the page. */
export interface ScannedStructuredPosting {
  sourceJobId: string | null;
  canonicalUrl: string | null;
  title: string | null;
  company: string | null;
  location: string | null;
  description: string | null;
  postedAtText: string | null;
  salaryText: string | null;
  employmentType: string | null;
  workModeHints: string[];
}

/** Everything the scanner read from one page, as detached plain JSON. */
export interface CompactDiscoveryScanPayload {
  structuredPostings: ScannedStructuredPosting[];
  cardContainers: ScannedCardContainer[];
  elements: ScannedInteractiveElement[];
}

interface CompactDiscoveryScanArg {
  maxContainers: number;
  maxElements: number;
  maxStructuredPostings: number;
  maxLinesPerContainer: number;
  maxLineChars: number;
}

// ---------------------------------------------------------------------------
// In-page scanner
//
// Runs inside the browser context under real Playwright. It only reads the
// DOM generically and returns plain JSON; all interpretation happens
// adapter-side in the pure functions below.
// ---------------------------------------------------------------------------

/** Exported for Playwright/HTML fixture tests that exercise live DOM binding. */
export function compactDiscoveryInPageScan(
  arg: CompactDiscoveryScanArg,
): CompactDiscoveryScanPayload {
  // Keep evaluate-time bounds local: Playwright serializes this function
  // without module-scope constants.
  const maxJsonLdQueueNodes = 40;
  const payload: CompactDiscoveryScanPayload = {
    structuredPostings: [],
    cardContainers: [],
    elements: [],
  };

  const collapse = (value: unknown): string =>
    String(value ?? "")
      .replace(/\s+/g, " ")
      .trim();

  const sliceBounded = (value: string, maxChars: number): string =>
    value.slice(0, Math.max(0, maxChars));

  const decodeBasicEntities = (value: string): string =>
    value
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#0?39;/g, "'");

  const stripMarkup = (value: unknown): string =>
    decodeBasicEntities(String(value ?? "").replace(/<[^>]*>/g, " "));

  const isVisible = (element: Element): boolean => {
    if (
      element.getAttribute("aria-hidden") === "true" ||
      element.hasAttribute("hidden") ||
      element.getAttribute("inert") !== null
    ) {
      return false;
    }

    const owner = element instanceof HTMLElement ? element : null;
    if (owner !== null && owner.hidden) {
      return false;
    }
    if (owner !== null) {
      const style = window.getComputedStyle(owner);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse" ||
        Number(style.opacity || "1") <= 0.01
      ) {
        return false;
      }
    }

    const rect = element.getBoundingClientRect();
    return rect.width >= 1 && rect.height >= 1;
  };

  const readAccessibleName = (element: Element): string => {
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.trim()) {
      return collapse(ariaLabel);
    }

    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const labelledByText = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .filter((value) => value.trim().length > 0)
        .join(" ");
      if (labelledByText.trim()) {
        return collapse(labelledByText);
      }
    }

    const title = element.getAttribute("title");
    if (title && title.trim()) {
      return collapse(title);
    }

    if (element instanceof HTMLElement) {
      const innerText = collapse(element.innerText);
      if (innerText) {
        return innerText;
      }
    }

    return collapse(element.textContent);
  };

  const resolveRole = (element: Element): string => {
    const explicitRole = element.getAttribute("role");
    if (explicitRole && explicitRole.trim()) {
      return collapse(explicitRole).toLowerCase();
    }

    if (element instanceof HTMLAnchorElement) {
      return "link";
    }
    if (element instanceof HTMLButtonElement) {
      return "button";
    }
    if (element instanceof HTMLInputElement) {
      const inputType = collapse(element.getAttribute("type")).toLowerCase();
      return ["button", "submit", "reset"].includes(inputType)
        ? "button"
        : "textbox";
    }

    return collapse(element.tagName).toLowerCase();
  };

  const resolveAbsoluteHref = (element: Element): string | null => {
    if (!(element instanceof HTMLAnchorElement)) {
      return null;
    }

    const rawHref = element.getAttribute("href");
    if (!rawHref || !rawHref.trim()) {
      return null;
    }

    try {
      const parsed = new URL(rawHref, window.location.href);
      return parsed.protocol === "http:" || parsed.protocol === "https:"
        ? parsed.toString()
        : null;
    } catch {
      return null;
    }
  };

  const readGenericJobIdHint = (
    element: Element,
    container: Element | null,
  ): string | null => {
    const holders = container ? [element, container] : [element];
    const attributeNames = [
      "data-job-id",
      "data-jobid",
      "data-testid-job-id",
      "data-position-id",
      "data-requirement-id",
    ];

    for (const holder of holders) {
      for (const attributeName of attributeNames) {
        const value = holder.getAttribute(attributeName);
        if (value && value.trim()) {
          return collapse(value).slice(0, 120);
        }
      }
    }

    return null;
  };

  // Generic list-item semantics only; class-name heuristics stay out.
  const CONTAINER_SELECTOR =
    'article, li, [role="listitem"], [role="article"], [role="option"]';
  const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6, [role="heading"]';

  const containerByKey = new Map<string, { node: Element; key: string }>();
  let containerCounter = 0;

  const resolveContainerKey = (element: Element): string | null => {
    const container = element.closest(CONTAINER_SELECTOR);
    if (!container || !isVisible(container)) {
      return null;
    }

    for (const [key, entry] of containerByKey) {
      if (entry.node === container) {
        return key;
      }
    }

    if (containerCounter >= arg.maxContainers) {
      return null;
    }

    const key = `c${containerCounter}`;
    containerCounter += 1;
    containerByKey.set(key, { node: container, key });
    return key;
  };

  // Job boards often put employer profile links (`/company/…`, `/employer/…`)
  // on a parent card while nested rows only have job-title links. Accept only
  // when exactly one employer profile is in scope (multi-job same-employer OK;
  // results lists with many employers are not).
  const EMPLOYER_PROFILE_PATH_MARKERS = new Set(["company", "employer"]);
  const readCompanyAnchorLabel = (anchor: HTMLAnchorElement): string | null => {
    const label = collapse(
      anchor.innerText ||
        anchor.textContent ||
        anchor.getAttribute("aria-label") ||
        anchor.getAttribute("title") ||
        "",
    );
    if (
      !label ||
      label.length > 120 ||
      /^(?:https?|ftp):\/\//i.test(label) ||
      /^www\./i.test(label) ||
      /^(?:Https?|Http|Www|Ftp)\s+/i.test(label) ||
      /^(view|see|about|company|profile|jobs?|careers?)\b/i.test(label)
    ) {
      return null;
    }
    return label;
  };

  const inferCompanyLabelFromSlug = (slug: string): string | null => {
    const displaySlug = slug.replace(/-\d+$/u, "");
    if (!/[-_]/.test(displaySlug) && displaySlug.length >= 10) {
      return null;
    }
    if (/-(?:usd|eur|gbp|cad|aud|chf|jpy|cny|inr)$/i.test(displaySlug)) {
      return null;
    }
    return displaySlug
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const preferCompanyAnchorLabel = (
    next: string,
    current: string | null,
    slug: string,
  ): string => {
    if (!current) {
      return next;
    }

    const slugInferred = inferCompanyLabelFromSlug(slug);
    const currentLooksSlugInferred =
      slugInferred !== null &&
      current.toLowerCase() === slugInferred.toLowerCase();
    const nextLooksSlugInferred =
      slugInferred !== null &&
      next.toLowerCase() === slugInferred.toLowerCase();
    if (currentLooksSlugInferred && !nextLooksSlugInferred) {
      return next;
    }
    if (!currentLooksSlugInferred && nextLooksSlugInferred) {
      return current;
    }
    return next.length < current.length ? next : current;
  };

  const collectUniqueCompanyBindings = (
    root: Element,
  ): Array<{ href: string; label: string | null }> => {
    const bindingsBySlug = new Map<
      string,
      { href: string; label: string | null }
    >();
    for (const anchor of Array.from(
      root.querySelectorAll<HTMLAnchorElement>("a[href]"),
    )) {
      const resolved = resolveAbsoluteHref(anchor);
      if (!resolved) {
        continue;
      }
      try {
        const segments = new URL(resolved).pathname
          .split("/")
          .map((segment) => collapse(decodeURIComponent(segment)))
          .filter(Boolean);
        const profileIndex = segments.findIndex((segment) =>
          EMPLOYER_PROFILE_PATH_MARKERS.has(segment.toLowerCase()),
        );
        const slug = profileIndex >= 0 ? segments[profileIndex + 1] : null;
        if (!slug || /^(jobs|job|careers|career|search|apply)$/i.test(slug)) {
          continue;
        }
        const slugKey = slug.toLowerCase();
        const label = readCompanyAnchorLabel(anchor);
        const existing = bindingsBySlug.get(slugKey);
        if (!existing) {
          bindingsBySlug.set(slugKey, {
            href: resolved.slice(0, 2048),
            label,
          });
          continue;
        }
        if (label) {
          existing.label = preferCompanyAnchorLabel(
            label,
            existing.label,
            slug,
          );
        }
      } catch {
        // Ignore malformed company hrefs.
      }
    }
    return [...bindingsBySlug.values()];
  };

  const resolveUniqueCompanyBinding = (
    start: Element,
  ): { href: string; label: string | null } | null => {
    const direct = collectUniqueCompanyBindings(start);
    if (direct.length === 1) {
      return direct[0] ?? null;
    }
    let ancestor: Element | null = start.parentElement;
    for (let depth = 0; depth < 8 && ancestor; depth += 1) {
      const ancestorBindings = collectUniqueCompanyBindings(ancestor);
      if (ancestorBindings.length === 1) {
        return ancestorBindings[0] ?? null;
      }
      ancestor = ancestor.parentElement;
    }
    return null;
  };

  const interactiveElements = Array.from(
    document.querySelectorAll(
      'a[href], button, [role="button"], [role="link"]',
    ),
  ).filter(isVisible);

  for (const element of interactiveElements) {
    if (payload.elements.length >= arg.maxElements) {
      break;
    }

    const accessibleName = sliceBounded(
      readAccessibleName(element),
      arg.maxLineChars,
    );
    const containerKey = resolveContainerKey(element);
    const href = resolveAbsoluteHref(element);
    // Recover employer for job-title links even when the board uses plain
    // divs (no semantic listitem/article container).
    const companyBinding = href ? resolveUniqueCompanyBinding(element) : null;

    payload.elements.push({
      role: resolveRole(element),
      accessibleName,
      href,
      containerKey,
      jobIdHint: readGenericJobIdHint(
        element,
        containerKey === null
          ? null
          : (containerByKey.get(containerKey)?.node ?? null),
      ),
      companyHref: companyBinding?.href ?? null,
      companyLabel: companyBinding?.label ?? null,
    });
  }

  for (const [key, entry] of containerByKey) {
    if (payload.cardContainers.length >= arg.maxContainers) {
      break;
    }

    const container = entry.node;
    const headingNode = container.querySelector(HEADING_SELECTOR);
    const headingText = headingNode
      ? sliceBounded(collapse(headingNode.textContent), arg.maxLineChars)
      : "";
    const containerText =
      container instanceof HTMLElement
        ? container.innerText
        : (container.textContent ?? "");
    const lines = containerText
      .split(/\r?\n/)
      .map((line) => sliceBounded(collapse(line), arg.maxLineChars))
      .filter((line) => line.length > 0)
      .slice(0, arg.maxLinesPerContainer);

    const companyBinding = resolveUniqueCompanyBinding(container);

    payload.cardContainers.push({
      key,
      headingText: headingText || null,
      lines,
      easyApplyHint:
        /\b(easy apply|quick apply|one[- ]click apply|apply instantly)\b/i.test(
          collapse(containerText),
        ),
      companyHref: companyBinding?.href ?? null,
      companyLabel: companyBinding?.label ?? null,
    });
  }

  // JSON-LD JobPosting records, walked breadth-first through arrays/@graph.
  const scripts = Array.from(
    document.querySelectorAll('script[type="application/ld+json"]'),
  );

  const asRecord = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;

  const asArray = (value: unknown): unknown[] =>
    Array.isArray(value) ? value : [];

  const readRecordTypes = (record: Record<string, unknown>): string[] =>
    asArray(record["@type"])
      .concat([record["@type"]])
      .map((value) => collapse(value).toLowerCase())
      .filter(Boolean);

  const readIdentifierValue = (
    record: Record<string, unknown>,
  ): string | null => {
    const identifier = record.identifier;
    if (typeof identifier === "string" && identifier.trim()) {
      return collapse(identifier).slice(0, 160);
    }

    const identifierRecord = asRecord(identifier);
    if (identifierRecord) {
      const value =
        identifierRecord.value ??
        identifierRecord.name ??
        identifierRecord["@id"];
      if (value !== null && value !== undefined && String(value).trim()) {
        return collapse(String(value)).slice(0, 160);
      }
    }

    const direct = record.jobId ?? record.id;
    if (direct !== null && direct !== undefined && String(direct).trim()) {
      return collapse(String(direct)).slice(0, 160);
    }

    return null;
  };

  const readLocationText = (record: Record<string, unknown>): string | null => {
    const locations = asArray(record.jobLocation);
    const primary = locations.length > 0 ? locations[0] : record.jobLocation;
    const place = asRecord(primary);
    if (!place) {
      return null;
    }

    const addressRecord = asRecord(place.address) ?? asRecord(place);
    const parts = [
      addressRecord?.addressLocality,
      addressRecord?.addressRegion,
      addressRecord?.addressCountry,
    ]
      .map((value) =>
        typeof value === "string"
          ? collapse(value)
          : asRecord(value)?.name !== undefined
            ? collapse(String(asRecord(value)?.name))
            : "",
      )
      .filter(Boolean);

    return parts.length > 0 ? parts.join(", ").slice(0, 200) : null;
  };

  const readSalaryText = (record: Record<string, unknown>): string | null => {
    const baseSalary = asRecord(record.baseSalary);
    if (!baseSalary) {
      return null;
    }

    const valueRecord = asRecord(baseSalary.value);
    const currency = collapse(baseSalary.currency).toUpperCase();
    const unit = collapse(baseSalary.unitText);
    const amountParts: string[] = [];

    const minValue = valueRecord?.minValue;
    const maxValue = valueRecord?.maxValue;
    if (minValue !== undefined && minValue !== null && minValue !== "") {
      amountParts.push(String(minValue));
    }
    if (maxValue !== undefined && maxValue !== null && maxValue !== "") {
      amountParts.push(String(maxValue));
    }
    if (amountParts.length === 0 && valueRecord?.value != null) {
      amountParts.push(String(valueRecord.value));
    }
    if (amountParts.length === 0) {
      return null;
    }

    const symbol =
      currency === "USD" || currency === ""
        ? "$"
        : currency === "EUR"
          ? "€"
          : currency === "GBP"
            ? "£"
            : `${currency} `;
    const range = amountParts.join(" - ");
    return collapse(`${symbol}${range} ${unit}`).slice(0, 120);
  };

  for (const script of scripts) {
    if (payload.structuredPostings.length >= arg.maxStructuredPostings) {
      break;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent ?? "");
    } catch {
      continue;
    }

    const queue: unknown[] = [parsed];
    let visited = 0;
    while (queue.length > 0 && visited < maxJsonLdQueueNodes) {
      visited += 1;
      const current = queue.shift();
      const currentArray = asArray(current);
      if (currentArray.length > 0) {
        queue.push(...currentArray);
        continue;
      }

      const record = asRecord(current);
      if (!record) {
        continue;
      }

      queue.push(...asArray(record["@graph"]));
      const itemListElements = asArray(record.itemListElement);
      if (itemListElements.length > 0) {
        queue.push(...itemListElements);
      } else if (record.itemListElement != null) {
        queue.push(record.itemListElement);
      }
      const nestedItems = asArray(record.item);
      if (nestedItems.length > 0) {
        queue.push(...nestedItems);
      } else if (record.item != null) {
        queue.push(record.item);
      }

      if (
        payload.structuredPostings.length >= arg.maxStructuredPostings ||
        !readRecordTypes(record).includes("jobposting")
      ) {
        continue;
      }

      payload.structuredPostings.push({
        sourceJobId: readIdentifierValue(record),
        canonicalUrl:
          typeof record.url === "string" && record.url.trim()
            ? record.url.trim().slice(0, 2048)
            : null,
        title: collapse(record.title).slice(0, 200) || null,
        company:
          collapse(
            asRecord(record.hiringOrganization)?.name ??
              asRecord(record.hiringOrganization)?.legalName,
          ).slice(0, 200) || null,
        location: readLocationText(record),
        description:
          stripMarkup(record.description).slice(0, arg.maxLineChars * 4) ||
          null,
        postedAtText: collapse(record.datePosted).slice(0, 120) || null,
        salaryText: readSalaryText(record),
        employmentType:
          collapse(
            asArray(record.employmentType)[0] ?? record.employmentType,
          ).slice(0, 80) || null,
        workModeHints: [],
      });
    }
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Pure adapter-side helpers (directly unit-testable, no Playwright involved)
// ---------------------------------------------------------------------------

export interface BoundedTextResult {
  value: string | null;
  truncated: boolean;
}

/**
 * Truncates text to `maxChars` and reports whether clipping happened. The
 * truncation flag is mandatory honesty signal; the value never silently
 * trims to empty when the source had visible content.
 */
export function truncateBoundedText(
  value: string | null | undefined,
  maxChars: number,
): BoundedTextResult {
  const normalized = String(value ?? "").replace(/\r\n/g, "\n");
  if (!normalized.trim()) {
    return { value: null, truncated: false };
  }

  if (normalized.length <= maxChars) {
    return { value: normalized, truncated: false };
  }

  const clipped = normalized.slice(0, Math.max(0, maxChars));
  if (!clipped.trim()) {
    // Pathological leading-whitespace wall: report honestly instead of
    // letting downstream `.trim()` collapse the sample to an empty string.
    return { value: null, truncated: true };
  }

  return { value: clipped, truncated: true };
}

/**
 * Allocates reference ids that are unique within one observation. Ids are a
 * deterministic function of the candidate's kind plus a stable part derived
 * from accessible names/hrefs, so identical controls yield identical ids and
 * repeated controls are disambiguated with an explicit occurrence suffix
 * (duplicate ref ids are impossible by construction).
 */
export function createDiscoveryRefIdAllocator(): {
  next: (prefix: string, stablePart: string) => string;
} {
  const seen = new Set<string>();

  return {
    next(prefix: string, stablePart: string): string {
      const slug =
        String(stablePart ?? "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 48) || "control";

      const base = `${prefix}:${slug}`;
      let candidateId = base;
      let occurrence = 2;
      while (seen.has(candidateId)) {
        candidateId = `${base}~${occurrence}`;
        occurrence += 1;
      }

      seen.add(candidateId);
      return candidateId;
    },
  };
}

export interface ClassifiedPaginationControl {
  kind: "next_page" | "previous_page" | "numbered_page" | "load_more";
  label: string;
  pageNumber: number | null;
}

const NUMBERED_PAGE_EXACT_PATTERN = /^(?:page\s*)?(\d{1,4})$/i;
const LOAD_MORE_PATTERN =
  /\b(?:load|show|see|view)\s+more\b|^more\s+(?:jobs|results|listings|roles|positions)$/i;
const NEXT_PAGE_STRONG_PATTERN =
  /^(?:next(?:\s*page)?|»|›|>|forward|older(?:\s*(?:jobs|postings|results))?)$/i;
const NEXT_PAGE_LOOSE_PATTERN = /\bnext\b/i;
const PREVIOUS_PAGE_STRONG_PATTERN =
  /^(?:prev(?:ious)?(?:\s*page)?|«|‹|<|back|newer(?:\s*(?:jobs|results))?)$/i;
const PREVIOUS_PAGE_LOOSE_PATTERN = /\b(?:prev|previous)\b/i;

/**
 * Name-based pagination classification. Labels are accessible names; selectors
 * are never policy and never leave the adapter.
 */
export function classifyPaginationControl(
  accessibleName: string,
): ClassifiedPaginationControl | null {
  const label = String(accessibleName ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!label) {
    return null;
  }

  const numberedMatch = label.match(NUMBERED_PAGE_EXACT_PATTERN);
  if (numberedMatch) {
    const pageNumber = Number(numberedMatch[1]);
    if (Number.isInteger(pageNumber) && pageNumber >= 1) {
      return { kind: "numbered_page", label, pageNumber };
    }
  }

  if (LOAD_MORE_PATTERN.test(label)) {
    return { kind: "load_more", label, pageNumber: null };
  }

  if (NEXT_PAGE_STRONG_PATTERN.test(label)) {
    return { kind: "next_page", label, pageNumber: null };
  }

  if (PREVIOUS_PAGE_STRONG_PATTERN.test(label)) {
    return { kind: "previous_page", label, pageNumber: null };
  }

  if (PREVIOUS_PAGE_LOOSE_PATTERN.test(label)) {
    return { kind: "previous_page", label, pageNumber: null };
  }

  if (NEXT_PAGE_LOOSE_PATTERN.test(label)) {
    return { kind: "next_page", label, pageNumber: null };
  }

  return null;
}

const OVERLAY_CLOSE_NAME_PATTERN =
  /^(?:x|×|✕|close|dismiss|cancel|got\s*it|no\s*thanks|not\s*now|maybe\s*later|skip)$/i;

/** True for generic overlay-dismissal controls by accessible name. */
export function classifyOverlayCloseControl(
  role: string,
  accessibleName: string,
): boolean {
  const normalizedRole = String(role ?? "")
    .trim()
    .toLowerCase();
  return (
    (normalizedRole === "button" || normalizedRole === "link") &&
    OVERLAY_CLOSE_NAME_PATTERN.test(String(accessibleName ?? "").trim())
  );
}

/**
 * Splits inline-metadata lines such as
 * `Acme Corp · Berlin, DE · €70k · 2 days ago` into their segments so the
 * generic classifiers can read each part. Single-segment lines pass through.
 */
export function expandInlineMetadataSegments(line: string): string[] {
  const normalized = String(line ?? "").trim();
  if (!normalized) {
    return [];
  }

  const segments = normalized
    .split(/[•·|]/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.length > 1 ? segments : [normalized];
}

const ID_SHAPED_URL_SEGMENT_PATTERN = /^(?:\d{4,}|[0-9a-f]{8,})$/i;

function normalizeQueryParamKeyLocal(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isJobIdShapedParamKeyLocal(key: string): boolean {
  const normalized = normalizeQueryParamKeyLocal(key);
  return (
    normalized.includes("jobid") ||
    normalized.endsWith("jid") ||
    normalized === "id" ||
    normalized === "job" ||
    normalized === "req" ||
    normalized === "reqid" ||
    normalized === "opening"
  );
}

/**
 * Derives a stable source job id from a detail URL without site-specific
 * knowledge: an id-shaped final path segment wins, then id-shaped query
 * parameters, otherwise null (callers fall back to other identity sources).
 */
export function deriveSourceJobIdFromUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  const lastSegment = segments.at(-1);
  if (lastSegment && ID_SHAPED_URL_SEGMENT_PATTERN.test(lastSegment)) {
    return lastSegment.slice(0, 160);
  }

  if (lastSegment) {
    const numericPrefix = lastSegment.match(/^(\d{4,})/u);
    if (numericPrefix?.[1]) {
      return numericPrefix[1].slice(0, 160);
    }
  }

  const paramValues = [...parsed.searchParams.entries()]
    .filter(([key]) => isJobIdShapedParamKeyLocal(key))
    .map(([, value]) => value.trim())
    .filter(Boolean);

  if (paramValues.length > 0) {
    return paramValues.join("_").slice(0, 160);
  }

  return null;
}

function looksLikeJobPostingHref(href: string): boolean {
  try {
    const parsed = new URL(href);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const lastSegment = segments.at(-1);
    if (!lastSegment) {
      return false;
    }
    if (ID_SHAPED_URL_SEGMENT_PATTERN.test(lastSegment)) {
      return true;
    }
    return /^\d{4,}-/u.test(lastSegment);
  } catch {
    return false;
  }
}

function inferCompanyFromCompanyPathUrl(canonicalUrl: string): string | null {
  try {
    const parsed = new URL(canonicalUrl);
    const segments = parsed.pathname
      .split("/")
      .map((segment) => cleanText(decodeURIComponent(segment)))
      .filter(Boolean);
    const companyIndex = segments.findIndex(
      (segment) => segment.toLowerCase() === "company",
    );
    if (companyIndex < 0) {
      return null;
    }

    const slug = segments[companyIndex + 1];
    if (!slug || !/[a-z\p{L}]/iu.test(slug)) {
      return null;
    }

    const rest = segments.slice(companyIndex + 2);
    if (
      rest.length === 0 ||
      (rest.length === 1 && rest[0]?.toLowerCase() === "jobs")
    ) {
      return null;
    }

    return formatEmployerLabelFromSlug(slug);
  } catch {
    return null;
  }
}

/**
 * Employer from an explicit company profile href on a job card.
 * Accepts hubs (`/company/{slug}`) — those name the employer without implying
 * the hub page itself is a job.
 */
function inferEmployerFromCompanyProfileHref(
  companyHref: string | null | undefined,
): string | null {
  const raw = cleanText(companyHref ?? "");
  if (!raw) {
    return null;
  }

  const employerProfilePathMarkers = new Set(["company", "employer"]);

  try {
    const parsed = new URL(raw);
    const segments = parsed.pathname
      .split("/")
      .map((segment) => cleanText(decodeURIComponent(segment)))
      .filter(Boolean);
    const profileIndex = segments.findIndex((segment) =>
      employerProfilePathMarkers.has(segment.toLowerCase()),
    );
    if (profileIndex < 0) {
      return null;
    }

    const slug = segments[profileIndex + 1];
    if (
      !slug ||
      !/[a-z\p{L}]/iu.test(slug) ||
      /^(jobs|job|careers|career|search|apply)$/i.test(slug)
    ) {
      return null;
    }

    return formatEmployerLabelFromSlug(slug);
  } catch {
    return null;
  }
}

function buildCanonicalCandidateUrl(
  href: string | null,
  baseUrl: string,
): string | null {
  const raw = String(href ?? "").trim();
  if (!raw) {
    return null;
  }

  try {
    const parsed = new URL(raw, baseUrl || undefined);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    // Light-touch only: absolute resolution and fragment removal. Deep
    // canonicalization and merge-key identity stay downstream by contract.
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function buildPostingCompositeKey(
  canonicalUrl: string,
  sourceJobId: string,
): string {
  return `${canonicalUrl}::${sourceJobId}`;
}

const SALARY_TEXT_PATTERN =
  /(€|\$|£)\s?\d[\d.,]*\s?[kK]?(?:\s?[-–—]\s?(?:€|\$|£)?\s?\d[\d.,]*\s?[kK]?)?(?:\s?\/?\s?(?:yr|year|mo|month|wk|week|day|hr|hour))?/;
const POSTED_AT_TEXT_PATTERN =
  /\b(?:posted\s+)?(?:\d+\s+(?:minutes?|mins?|hours?|hrs?|days?|weeks?|months?)\s+ago|today|yesterday|just\s+posted)\b/i;
const LOCATION_HINT_PATTERN =
  /\b(remote|hybrid|on[- ]?site|onsite|work\s+from\s+home|worldwide|anywhere)\b/i;
const CITY_REGION_LOCATION_PATTERN =
  /^[A-ZÀ-Þ][\p{L}'’.-]+(?:\s+[A-ZÀ-Þ][\p{L}'’.-]+)*,\s*(?:[A-Z]{2}\b|[A-ZÀ-Þ][\p{L}'’.-]+)/u;
const COMPANY_NOISE_PATTERN =
  /^(?:apply|save|share|view|details|see more|show more|featured|promoted|new)\b/i;
const EASY_APPLY_HINT_PATTERN =
  /\b(easy apply|quick apply|one[- ]click apply|apply instantly|instant apply)\b/i;

function detectWorkModeHints(text: string): string[] {
  const normalized = String(text ?? "").toLowerCase();
  const hints: string[] = [];
  if (/\bremote\b|work\s+from\s+home/.test(normalized)) {
    hints.push("remote");
  }
  if (/\bhybrid\b/.test(normalized)) {
    hints.push("hybrid");
  }
  if (/\bon[- ]?site\b|\bin[- ]office\b|\bin\s+office\b/.test(normalized)) {
    hints.push("onsite");
  }
  if (/\bflexible\b/.test(normalized)) {
    hints.push("flexible");
  }
  return hints;
}

function toIsoDateTimeOrNull(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function cleanText(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function sliceToLabel(value: string): string {
  return cleanText(value).slice(0, DISCOVERY_OBSERVATION_LABEL_MAX);
}

interface RawPostingCandidate {
  sourceJobId: string;
  canonicalUrl: string;
  /** Raw href as scanned (pre-canonicalization), used to bind click actions. */
  rawHref?: string | null;
  applicationUrl: string | null;
  title: string;
  company: string | null;
  location: string | null;
  description: string | null;
  salaryText: string | null;
  postedAtText: string | null;
  postedAtIso: string | null;
  employmentType: string | null;
  workModeHints: string[];
  easyApplyEligible: boolean;
  origin: "json_ld" | "dom_card";
}

function buildStructuredPostingCandidates(
  structuredPostings: readonly ScannedStructuredPosting[],
  pageUrl: string,
): RawPostingCandidate[] {
  const candidates: RawPostingCandidate[] = [];

  for (const posting of structuredPostings) {
    const title = cleanText(posting.title).slice(
      0,
      DISCOVERY_OBSERVATION_LABEL_MAX,
    );
    if (!title) {
      continue;
    }

    const canonicalUrl = buildCanonicalCandidateUrl(
      posting.canonicalUrl,
      pageUrl,
    );
    if (!canonicalUrl) {
      continue;
    }

    candidates.push({
      sourceJobId:
        cleanText(posting.sourceJobId).slice(0, 160) ||
        deriveSourceJobIdFromUrl(canonicalUrl) ||
        title.toLowerCase(),
      canonicalUrl,
      applicationUrl: canonicalUrl,
      title,
      company: sanitizeObservedEmployerLabel(
        cleanText(posting.company).slice(0, DISCOVERY_OBSERVATION_LABEL_MAX),
      ),
      location:
        cleanText(posting.location).slice(0, DISCOVERY_OBSERVATION_LABEL_MAX) ||
        null,
      description:
        cleanText(posting.description).slice(
          0,
          POSTING_DESCRIPTION_MAX_CHARS,
        ) || null,
      salaryText: cleanText(posting.salaryText).slice(0, 120) || null,
      postedAtText: cleanText(posting.postedAtText).slice(0, 120) || null,
      postedAtIso: toIsoDateTimeOrNull(posting.postedAtText),
      employmentType: cleanText(posting.employmentType).slice(0, 80) || null,
      workModeHints: [
        ...detectWorkModeHints(
          [posting.location, posting.description, posting.employmentType]
            .map((value) => cleanText(value))
            .join(" "),
        ),
      ],
      easyApplyEligible: false,
      origin: "json_ld",
    });
  }

  return candidates;
}

/**
 * Maps one card container plus its primary element onto a posting candidate
 * using source-generic heuristics only (headings, accessible names, metadata
 * lines). Returns null when the container cannot form an honest candidate.
 */
export function buildDomCardPostingCandidate(input: {
  container: Pick<
    ScannedCardContainer,
    "headingText" | "lines" | "easyApplyHint" | "companyHref" | "companyLabel"
  > | null;
  element: Pick<
    ScannedInteractiveElement,
    "href" | "accessibleName" | "jobIdHint" | "companyHref" | "companyLabel"
  >;
  pageUrl: string;
}): RawPostingCandidate | null {
  const canonicalUrl = buildCanonicalCandidateUrl(
    input.element.href,
    input.pageUrl,
  );
  if (!canonicalUrl) {
    return null;
  }

  const lines = [...(input.container?.lines ?? [])];
  if (lines.length === 0 && cleanText(input.element.accessibleName)) {
    lines.push(cleanText(input.element.accessibleName));
  }

  const headingText = cleanText(input.container?.headingText);
  const accessibleName = cleanText(input.element.accessibleName);

  let title = headingText || accessibleName;
  let titleConsumedFromLines = false;
  if (!title && lines.length > 0) {
    title = lines[0] ?? "";
    titleConsumedFromLines = true;
  }

  title = cleanText(title).slice(0, DISCOVERY_OBSERVATION_LABEL_MAX);
  if (!title) {
    return null;
  }

  if (titleConsumedFromLines) {
    lines.shift();
  } else {
    const titleIndex = lines.findIndex(
      (line) => cleanText(line).toLowerCase() === title.toLowerCase(),
    );
    if (titleIndex >= 0) {
      lines.splice(titleIndex, 1);
    }
  }

  let company: string | null = null;
  let location: string | null = null;
  let salaryText: string | null = null;
  let postedAtText: string | null = null;
  const descriptionPool: string[] = [];
  const workModeEvidence: string[] = [title];

  const consumeLine = (rawLine: string): void => {
    for (const segment of expandInlineMetadataSegments(rawLine)) {
      const value = cleanText(segment);
      if (!value) {
        continue;
      }

      if (!salaryText && SALARY_TEXT_PATTERN.test(value)) {
        salaryText = value.slice(0, 120);
        continue;
      }

      if (!postedAtText && POSTED_AT_TEXT_PATTERN.test(value)) {
        postedAtText = value.slice(0, 120);
        continue;
      }

      const looksLikeLocation =
        LOCATION_HINT_PATTERN.test(value) ||
        CITY_REGION_LOCATION_PATTERN.test(value);
      if (looksLikeLocation) {
        if (!location) {
          location = value.slice(0, DISCOVERY_OBSERVATION_LABEL_MAX);
        }
        workModeEvidence.push(value);
        continue;
      }

      if (
        company === null &&
        value.length <= 60 &&
        !COMPANY_NOISE_PATTERN.test(value) &&
        !EASY_APPLY_HINT_PATTERN.test(value)
      ) {
        company = value.slice(0, DISCOVERY_OBSERVATION_LABEL_MAX);
        continue;
      }

      descriptionPool.push(value.slice(0, POSTING_DESCRIPTION_MAX_CHARS));
      workModeEvidence.push(value);
    }
  };

  for (const line of lines) {
    consumeLine(line);
  }

  const companyHrefEmployer = inferEmployerFromCompanyProfileHref(
    input.container?.companyHref ?? input.element.companyHref,
  );
  const companyLabel = sanitizeObservedEmployerLabel(
    cleanText(
      input.container?.companyLabel ?? input.element.companyLabel,
    ).slice(0, DISCOVERY_OBSERVATION_LABEL_MAX),
  );
  if (companyLabel) {
    company = companyLabel;
  } else if (companyHrefEmployer) {
    company = companyHrefEmployer;
  } else {
    company = sanitizeObservedEmployerLabel(company);
  }

  const description = cleanText(descriptionPool.join(" ")).slice(
    0,
    POSTING_DESCRIPTION_MAX_CHARS,
  );
  const easyApplyEligible =
    (input.container?.easyApplyHint ?? false) ||
    EASY_APPLY_HINT_PATTERN.test(accessibleName) ||
    lines.some((line) => EASY_APPLY_HINT_PATTERN.test(line));

  return {
    sourceJobId:
      cleanText(input.element.jobIdHint).slice(0, 160) ||
      deriveSourceJobIdFromUrl(canonicalUrl) ||
      title.toLowerCase(),
    canonicalUrl,
    rawHref: cleanText(input.element.href) || null,
    applicationUrl: canonicalUrl,
    title,
    company,
    location,
    description: description || null,
    salaryText,
    postedAtText,
    postedAtIso: null,
    employmentType: null,
    workModeHints: detectWorkModeHints(workModeEvidence.join(" ")),
    easyApplyEligible,
    origin: "dom_card",
  };
}

interface DeduplicatedCandidatesResult {
  uniqueCandidates: RawPostingCandidate[];
  duplicatesMergedCount: number;
}

/**
 * Deduplicates candidates by the canonical source URL/sourceJobId composite.
 * The first candidate keeps precedence for conflicting authoritative values,
 * while later observations fill missing fields and contribute additive hints.
 */
export function deduplicatePostingCandidates(
  candidates: readonly RawPostingCandidate[],
): DeduplicatedCandidatesResult {
  const indexByComposite = new Map<string, number>();
  const uniqueCandidates: RawPostingCandidate[] = [];
  let duplicatesMergedCount = 0;

  for (const candidate of candidates) {
    const composite = buildPostingCompositeKey(
      candidate.canonicalUrl,
      candidate.sourceJobId,
    );
    const existingIndex = indexByComposite.get(composite);
    if (existingIndex !== undefined) {
      const existing = uniqueCandidates[existingIndex];
      if (!existing) {
        throw new Error("Compact discovery candidate index is invalid.");
      }
      uniqueCandidates[existingIndex] = {
        ...existing,
        rawHref: existing.rawHref ?? candidate.rawHref ?? null,
        applicationUrl: existing.applicationUrl ?? candidate.applicationUrl,
        company: existing.company ?? candidate.company,
        location: existing.location ?? candidate.location,
        description: existing.description ?? candidate.description,
        salaryText: existing.salaryText ?? candidate.salaryText,
        postedAtText: existing.postedAtText ?? candidate.postedAtText,
        postedAtIso: existing.postedAtIso ?? candidate.postedAtIso,
        employmentType: existing.employmentType ?? candidate.employmentType,
        workModeHints: [
          ...new Set([...existing.workModeHints, ...candidate.workModeHints]),
        ],
        easyApplyEligible:
          existing.easyApplyEligible || candidate.easyApplyEligible,
      };
      duplicatesMergedCount += 1;
      continue;
    }

    indexByComposite.set(composite, uniqueCandidates.length);
    uniqueCandidates.push(candidate);
  }

  return { uniqueCandidates, duplicatesMergedCount };
}

/** Input shape accepted by `JobPostingSchema` (defaulted fields optional). */
type JobPostingSchemaInput = z.input<typeof JobPostingSchema>;

function toJobPostingInput(
  candidate: RawPostingCandidate,
  observedAt: string,
): JobPostingSchemaInput {
  return {
    source: "target_site",
    sourceJobId: candidate.sourceJobId,
    discoveryMethod: "browser_agent",
    collectionMethod: "careers_page",
    canonicalUrl: candidate.canonicalUrl,
    applicationUrl: candidate.applicationUrl,
    title: candidate.title,
    // Prefer observed employer text, then `/company/{slug}/…` URL inference,
    // then an explicit absence label so downstream UI can hide placeholders
    // without inventing an employer.
    company:
      candidate.company ??
      inferCompanyFromCompanyPathUrl(candidate.canonicalUrl) ??
      "Employer not stated",
    location: candidate.location ?? "Location not stated",
    workMode: candidate.workModeHints,
    applyPath: candidate.easyApplyEligible ? "easy_apply" : "unknown",
    easyApplyEligible: candidate.easyApplyEligible,
    postedAt: candidate.postedAtIso,
    postedAtText: candidate.postedAtText,
    discoveredAt: observedAt,
    salaryText: candidate.salaryText,
    description: candidate.description ?? candidate.title,
    summary: null,
    employmentType: candidate.employmentType,
  };
}

// ---------------------------------------------------------------------------
// Control candidate construction
// ---------------------------------------------------------------------------

export interface RoutedScannedElements {
  paginationControls: ClassifiedPaginationControl[];
  overlayCloseLabels: string[];
  /** Elements not consumed by pagination/overlay classification. */
  openableElements: ScannedInteractiveElement[];
}

/**
 * Routes every scanned element into exactly one bucket, in scan order.
 * Pagination controls are classified first so paging links are never
 * mistaken for posting cards or posting-open actions; generic overlay-close
 * controls come next; everything else remains an open-posting element.
 */
export function routeScannedInteractiveElements(
  elements: readonly ScannedInteractiveElement[],
): RoutedScannedElements {
  const routed: RoutedScannedElements = {
    paginationControls: [],
    overlayCloseLabels: [],
    openableElements: [],
  };

  for (const element of elements) {
    const label = sliceToLabel(element.accessibleName);

    if (label) {
      const pagination = classifyPaginationControl(label);
      if (pagination) {
        routed.paginationControls.push(pagination);
        continue;
      }

      if (classifyOverlayCloseControl(element.role, label)) {
        routed.overlayCloseLabels.push(label);
        continue;
      }
    }

    routed.openableElements.push(element);
  }

  return routed;
}

interface RawPaginationCandidate {
  kind: "next_page" | "previous_page" | "numbered_page" | "load_more";
  label: string;
  pageNumber: number | null;
  stablePart: string;
}

interface RawActionCandidate {
  kind: "open_posting" | "close_overlay";
  label: string;
  stablePart: string;
}

export interface BuiltControlCandidates {
  paginationCandidates: Array<{
    refId: string;
    kind: RawPaginationCandidate["kind"];
    label: string;
    pageNumber: number | null;
  }>;
  actionCandidates: Array<{
    refId: string;
    kind: RawActionCandidate["kind"];
    label: string;
  }>;
  omittedPaginationCount: number;
  omittedActionCount: number;
}

/**
 * Builds bounded, ref-scoped control candidates from pre-routed elements.
 * Open-posting actions are attached only to elements backing kept posting
 * candidates, claimed once per target. Reference ids are allocated from one
 * allocator shared by both groups, so ids cannot collide within an
 * observation.
 */
export function buildControlCandidatesFromScan(input: {
  routed: RoutedScannedElements;
  openPostingTargets: ReadonlyMap<
    string,
    { label: string; stablePart: string }
  >;
  paginationMax: number;
  actionMax: number;
}): BuiltControlCandidates {
  const paginationRaw: RawPaginationCandidate[] =
    input.routed.paginationControls.map((control) => ({
      kind: control.kind,
      label: control.label,
      pageNumber: control.pageNumber,
      stablePart: `${control.kind}:${control.label}${control.pageNumber !== null ? `:${control.pageNumber}` : ""}`,
    }));

  const actionRaw: RawActionCandidate[] = input.routed.overlayCloseLabels.map(
    (label) => ({
      kind: "close_overlay" as const,
      label,
      stablePart: `close_overlay:${label}`,
    }),
  );

  const claimedOpenPostingKeys = new Set<string>();
  for (const element of input.routed.openableElements) {
    const elementHref = element.href;
    const openTargetKey = elementHref ?? element.containerKey;
    if (
      !elementHref ||
      !openTargetKey ||
      claimedOpenPostingKeys.has(openTargetKey)
    ) {
      continue;
    }

    const target = input.openPostingTargets.get(openTargetKey);
    if (!target) {
      continue;
    }

    claimedOpenPostingKeys.add(openTargetKey);
    actionRaw.push({
      kind: "open_posting",
      // The label is the control's accessible name; the posting title only
      // backfills degenerate empty names.
      label: sliceToLabel(element.accessibleName) || sliceToLabel(target.label),
      stablePart: `open_posting:${target.stablePart}`,
    });
  }

  const allocator = createDiscoveryRefIdAllocator();
  const boundedPagination = paginationRaw.slice(
    0,
    Math.max(0, input.paginationMax),
  );
  const boundedActions = actionRaw.slice(0, Math.max(0, input.actionMax));

  return {
    paginationCandidates: boundedPagination.map((candidate) => ({
      refId: allocator.next("pagination", candidate.stablePart),
      kind: candidate.kind,
      label: candidate.label,
      pageNumber: candidate.pageNumber,
    })),
    actionCandidates: boundedActions.map((candidate) => ({
      refId: allocator.next("action", candidate.stablePart),
      kind: candidate.kind,
      label: candidate.label,
    })),
    omittedPaginationCount: Math.max(
      0,
      paginationRaw.length - boundedPagination.length,
    ),
    omittedActionCount: Math.max(0, actionRaw.length - boundedActions.length),
  };
}

// ---------------------------------------------------------------------------
// Unsupported-outcome classification (generic text signals, one reason only)
// ---------------------------------------------------------------------------

interface UnsupportedSignal {
  reason: DiscoveryCompactObservationUnsupportedReason;
  pattern: RegExp;
}

// Ordered by specificity: hard protection walls win over interactive
// challenges, which win over sign-in walls. Exactly one reason is reported.
const UNSUPPORTED_SIGNALS: readonly UnsupportedSignal[] = [
  {
    reason: "site_protection",
    pattern:
      /verify (?:you are|i'?m) (?:human|a human)|\bcaptcha\b|are you a robot|attention required|access denied|checking your browser|pardon our interruption|unusual traffic|request blocked|ddos protection/i,
  },
  {
    reason: "manual_step_required",
    pattern:
      /press and hold|drag the (?:slider|handle)|complete the (?:puzzle|quiz)|solve the (?:puzzle|challenge)|slide to verify|rotate the/i,
  },
  {
    reason: "auth_required",
    pattern:
      /(?:sign|log)\s?in to (?:continue|proceed|view|see|apply)|please (?:sign|log) in|session (?:has )?expired|account (?:has been )?(?:suspended|locked)/i,
  },
];

export function classifyUnsupportedSignal(
  pageTitle: string | null,
  bodyText: string | null,
): {
  reason: DiscoveryCompactObservationUnsupportedReason;
  detail: string;
} | null {
  const haystack = `${pageTitle ?? ""}\n${bodyText ?? ""}`
    .replace(/\s+/g, " ")
    .trim();
  if (!haystack) {
    return null;
  }

  for (const signal of UNSUPPORTED_SIGNALS) {
    const match = haystack.match(signal.pattern);
    if (match) {
      return {
        reason: signal.reason,
        detail: `Blocked by "${match[0]}" while observing ${haystack.slice(0, 200)}`,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Option normalization and input validation
// ---------------------------------------------------------------------------

function clampBound(
  value: number | undefined,
  fallback: number,
  max: number,
): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(value), 0), max);
}

interface NormalizedObserverOptions {
  textSampleMaxChars: number;
  accessibilitySummaryMaxChars: number;
  postingCandidatesMax: number;
  paginationCandidatesMax: number;
  actionCandidatesMax: number;
}

function normalizeObserverOptions(
  options: CompactDiscoveryObserverOptions | undefined,
): NormalizedObserverOptions {
  return {
    textSampleMaxChars: clampBound(
      options?.textSampleMaxChars,
      DISCOVERY_OBSERVATION_TEXT_SAMPLE_MAX,
      DISCOVERY_OBSERVATION_TEXT_SAMPLE_MAX,
    ),
    accessibilitySummaryMaxChars: clampBound(
      options?.accessibilitySummaryMaxChars,
      DISCOVERY_OBSERVATION_ACCESSIBILITY_SUMMARY_MAX,
      DISCOVERY_OBSERVATION_ACCESSIBILITY_SUMMARY_MAX,
    ),
    postingCandidatesMax: clampBound(
      options?.postingCandidatesMax,
      DISCOVERY_OBSERVATION_POSTING_CANDIDATES_MAX,
      DISCOVERY_OBSERVATION_POSTING_CANDIDATES_MAX,
    ),
    paginationCandidatesMax: clampBound(
      options?.paginationCandidatesMax,
      DISCOVERY_OBSERVATION_PAGINATION_CANDIDATES_MAX,
      DISCOVERY_OBSERVATION_PAGINATION_CANDIDATES_MAX,
    ),
    actionCandidatesMax: clampBound(
      options?.actionCandidatesMax,
      DISCOVERY_OBSERVATION_ACTION_CANDIDATES_MAX,
      DISCOVERY_OBSERVATION_ACTION_CANDIDATES_MAX,
    ),
  };
}

const CaptureIdentityInputSchema = z
  .object({
    targetId: z.string().trim().min(1),
    observationId: z.string().trim().min(1),
    revision: z.number().int().positive(),
    observedAt: z.string().datetime(),
  })
  .strict();

interface ObservationIdentity {
  targetId: string;
  observationId: string;
  revision: number;
  observedAt: string;
}

function parseCaptureIdentity(
  input: CaptureCompactDiscoveryObservationInput,
): ObservationIdentity {
  const parsed = CaptureIdentityInputSchema.safeParse({
    targetId: input.targetId,
    observationId: input.observationId,
    revision: input.revision,
    observedAt: input.observedAt,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid compact discovery observation identity: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
        .join("; ")}`,
    );
  }

  return parsed.data;
}

// ---------------------------------------------------------------------------
// Capture pipeline
// ---------------------------------------------------------------------------

function isUsableHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function readPageTitle(page: Page): Promise<string | null> {
  try {
    const title = await Promise.resolve(page.title());
    return typeof title === "string" && title.trim() ? title.trim() : null;
  } catch {
    return null;
  }
}

async function readBodyText(page: Page): Promise<string | null> {
  try {
    const bodyLocator = page.locator("body");
    const text = await Promise.resolve(bodyLocator.innerText());
    return typeof text === "string" ? text : null;
  } catch {
    return null;
  }
}

async function readAccessibilitySnapshot(
  page: Page,
): Promise<string | null | undefined> {
  const bodyLocator = page.locator("body") as unknown;
  if (
    !bodyLocator ||
    typeof bodyLocator !== "object" ||
    !("ariaSnapshot" in bodyLocator) ||
    typeof (bodyLocator as { ariaSnapshot?: unknown }).ariaSnapshot !==
      "function"
  ) {
    return undefined;
  }

  try {
    const snapshot = await (
      bodyLocator as { ariaSnapshot: () => Promise<unknown> }
    ).ariaSnapshot();
    return typeof snapshot === "string" ? snapshot : null;
  } catch {
    return null;
  }
}

async function readScanPayload(
  page: Page,
): Promise<CompactDiscoveryScanPayload | null> {
  const scanArg: CompactDiscoveryScanArg = {
    maxContainers: MAX_SCAN_CONTAINERS,
    maxElements: MAX_SCAN_ELEMENTS,
    maxStructuredPostings: MAX_SCAN_STRUCTURED_POSTINGS,
    maxLinesPerContainer: MAX_SCAN_LINES_PER_CONTAINER,
    maxLineChars: MAX_SCAN_LINE_CHARS,
  };

  const evaluated = await page.evaluate(compactDiscoveryInPageScan, scanArg);
  if (
    evaluated === null ||
    evaluated === undefined ||
    typeof evaluated !== "object"
  ) {
    return null;
  }

  const candidate = evaluated as Partial<CompactDiscoveryScanPayload>;
  return {
    structuredPostings: Array.isArray(candidate.structuredPostings)
      ? candidate.structuredPostings
      : [],
    cardContainers: Array.isArray(candidate.cardContainers)
      ? candidate.cardContainers.map((container) => ({
          key: String(container.key ?? ""),
          headingText: container.headingText ?? null,
          lines: Array.isArray(container.lines) ? container.lines : [],
          easyApplyHint: Boolean(container.easyApplyHint),
          companyHref:
            typeof container.companyHref === "string"
              ? container.companyHref
              : null,
          companyLabel:
            typeof container.companyLabel === "string"
              ? container.companyLabel
              : null,
        }))
      : [],
    elements: Array.isArray(candidate.elements)
      ? candidate.elements.map((element) => ({
          role: String(element.role ?? ""),
          accessibleName: String(element.accessibleName ?? ""),
          href: typeof element.href === "string" ? element.href : null,
          containerKey:
            typeof element.containerKey === "string"
              ? element.containerKey
              : null,
          jobIdHint:
            typeof element.jobIdHint === "string" ? element.jobIdHint : null,
          companyHref:
            typeof element.companyHref === "string"
              ? element.companyHref
              : null,
          companyLabel:
            typeof element.companyLabel === "string"
              ? element.companyLabel
              : null,
        }))
      : [],
  };
}

function finalizeObservation(
  candidate: DiscoveryCompactObservation,
): DiscoveryCompactObservation {
  const parsed = DiscoveryCompactObservationSchema.safeParse(candidate);
  if (parsed.success) {
    return parsed.data;
  }

  throw new Error(
    `Compact discovery observation failed contract validation: ${parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ")}`,
  );
}

function buildUnsupportedObservation(input: {
  identity: ObservationIdentity;
  reason: DiscoveryCompactObservationUnsupportedReason;
  detail: string | null;
  pageUrl?: string;
  pageTitle?: string | null;
  content?: DiscoveryCompactObservation["content"];
}): DiscoveryCompactObservation {
  let resolvedPageUrl = "about:blank";
  const candidateUrl = input.pageUrl?.trim();
  if (candidateUrl) {
    try {
      new URL(candidateUrl);
      resolvedPageUrl = candidateUrl;
    } catch {
      resolvedPageUrl = "about:blank";
    }
  }

  return finalizeObservation({
    kind: "unsupported",
    observationId: input.identity.observationId,
    revision: input.identity.revision,
    targetId: input.identity.targetId,
    observedAt: input.identity.observedAt,
    pageUrl: resolvedPageUrl,
    pageTitle:
      input.pageTitle === undefined
        ? null
        : input.pageTitle === null
          ? null
          : sliceToLabel(input.pageTitle),
    reason: input.reason,
    detail: input.detail ? input.detail.slice(0, 600) : null,
    content: input.content ?? {
      textSample: null,
      accessibilitySummary: null,
      textTruncated: false,
      accessibilitySummaryTruncated: false,
    },
  });
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Captures one deterministic compact-snapshot observation of `page`.
 *
 * Returns exactly one schema-validated observation: `supported` with bounded
 * summaries, typed posting candidates, and unique snapshot-scoped control
 * references, or `unsupported` with one explicit terminal reason. Page-side
 * failures never throw; only invalid caller-owned identity inputs throw.
 *
 * The production discovery run loop invokes this once before legacy tool or
 * model work (ADR 0013 tier two). Orchestration still owns budgets, persistence,
 * fallback, and follow-up actions.
 */
export async function captureCompactDiscoveryObservation(
  input: CaptureCompactDiscoveryObservationInput,
): Promise<DiscoveryCompactObservation> {
  const identity = parseCaptureIdentity(input);
  const options = normalizeObserverOptions(input.options);

  let pageUrl = "";
  try {
    pageUrl = String(input.page.url() ?? "");
  } catch {
    pageUrl = "";
  }

  if (!isUsableHttpUrl(pageUrl)) {
    return buildUnsupportedObservation({
      identity,
      reason: "navigation_failed",
      detail: "Page URL is not a usable HTTP(S) location.",
      pageUrl,
    });
  }

  let pageTitle: string | null = null;
  let bodyText: string | null = null;
  let snapshot: string | null | undefined;
  let scanPayload: CompactDiscoveryScanPayload | null = null;
  let captureErrorDetail: string | null = null;

  try {
    pageTitle = await readPageTitle(input.page);
    bodyText = await readBodyText(input.page);
    snapshot = await readAccessibilitySnapshot(input.page);
    scanPayload = await readScanPayload(input.page);
  } catch (error) {
    captureErrorDetail = error instanceof Error ? error.name : "UnknownError";
  }

  const textSample = truncateBoundedText(bodyText, options.textSampleMaxChars);
  const accessibilitySummary = truncateBoundedText(
    snapshot === undefined ? null : snapshot,
    options.accessibilitySummaryMaxChars,
  );
  const content = {
    textSample: textSample.value,
    accessibilitySummary: accessibilitySummary.value,
    textTruncated: textSample.truncated,
    accessibilitySummaryTruncated: accessibilitySummary.truncated,
  };

  if (captureErrorDetail !== null) {
    return buildUnsupportedObservation({
      identity,
      reason: "navigation_failed",
      detail: `Compact snapshot capture failed (${captureErrorDetail}).`,
      pageUrl,
      pageTitle,
      content,
    });
  }

  // Blocker signals win over layout interpretation, and exactly one reason is
  // reported per capture.
  const hasObservedPostingInventory =
    (scanPayload?.structuredPostings.length ?? 0) > 0 ||
    (scanPayload?.elements ?? []).some(
      (element) =>
        element.href !== null &&
        (element.containerKey !== null ||
          element.jobIdHint !== null ||
          looksLikeJobPostingHref(element.href)),
    );
  const unsupportedSignal = hasObservedPostingInventory
    ? null
    : classifyUnsupportedSignal(pageTitle, bodyText);
  if (unsupportedSignal) {
    return buildUnsupportedObservation({
      identity,
      reason: unsupportedSignal.reason,
      detail: unsupportedSignal.detail,
      pageUrl,
      pageTitle,
      content,
    });
  }

  const routedElements = routeScannedInteractiveElements(
    scanPayload?.elements ?? [],
  );

  const rawPostingCandidates: RawPostingCandidate[] = scanPayload
    ? [
        ...buildStructuredPostingCandidates(
          scanPayload.structuredPostings,
          pageUrl,
        ),
        ...buildDomCardCandidates(
          routedElements.openableElements,
          scanPayload,
          pageUrl,
        ),
      ]
    : [];

  const { uniqueCandidates, duplicatesMergedCount } =
    deduplicatePostingCandidates(rawPostingCandidates);

  const listingCandidates = uniqueCandidates.filter(
    (candidate) =>
      !isLikelySiteUtilityJob({
        canonicalUrl: candidate.canonicalUrl,
        title: candidate.title,
      }),
  );

  const keptCandidates = listingCandidates.slice(
    0,
    options.postingCandidatesMax,
  );
  const omittedPostingCandidateCount = Math.max(
    0,
    listingCandidates.length - keptCandidates.length,
  );

  const parsedPostings: JobPosting[] = [];
  let invalidPostingRowCount = 0;
  for (const candidate of keptCandidates) {
    const parsed = JobPostingSchema.safeParse(
      toJobPostingInput(candidate, identity.observedAt),
    );
    if (parsed.success) {
      parsedPostings.push(parsed.data);
    } else {
      invalidPostingRowCount += 1;
    }
  }

  const openPostingTargets = new Map<
    string,
    { label: string; stablePart: string }
  >();
  for (const candidate of keptCandidates) {
    if (candidate.origin !== "dom_card") {
      continue;
    }

    // Bind by both the raw scanned href and the canonical URL so hash-only
    // differences cannot orphan a click target.
    const target = {
      label: candidate.title,
      stablePart: candidate.sourceJobId,
    };
    if (candidate.rawHref) {
      openPostingTargets.set(candidate.rawHref, target);
    }
    openPostingTargets.set(candidate.canonicalUrl, target);
  }

  const controls = buildControlCandidatesFromScan({
    routed: routedElements,
    openPostingTargets,
    paginationMax: options.paginationCandidatesMax,
    actionMax: options.actionCandidatesMax,
  });

  const uncertaintyNotes = buildUncertaintyNotes({
    duplicatesMergedCount,
    omittedPostingCandidateCount,
    omittedPaginationCount: controls.omittedPaginationCount,
    omittedActionCount: controls.omittedActionCount,
    invalidPostingRowCount,
    accessibilitySnapshotUnavailable: snapshot === undefined,
    textCaptureFailed: bodyText === null,
    textTruncated: content.textTruncated,
    accessibilitySummaryTruncated: content.accessibilitySummaryTruncated,
  });

  if (
    parsedPostings.length === 0 &&
    controls.paginationCandidates.length === 0 &&
    controls.actionCandidates.length === 0
  ) {
    return buildUnsupportedObservation({
      identity,
      reason: "unsupported_layout",
      detail:
        "No job inventory, pagination controls, or actionable posting controls were recognized on this page.",
      pageUrl,
      pageTitle,
      content,
    });
  }

  return finalizeObservation({
    kind: "supported",
    observationId: identity.observationId,
    revision: identity.revision,
    targetId: identity.targetId,
    observedAt: identity.observedAt,
    pageUrl,
    pageTitle: pageTitle === null ? null : sliceToLabel(pageTitle),
    sourceKind:
      accessibilitySummary.value === null
        ? "visible_text"
        : "accessibility_snapshot",
    content,
    postingCandidates: parsedPostings,
    paginationCandidates: controls.paginationCandidates,
    actionCandidates: controls.actionCandidates,
    uncertaintyNotes,
    omittedPostingCandidateCount,
  });
}

function buildDomCardCandidates(
  openableElements: readonly ScannedInteractiveElement[],
  scanPayload: CompactDiscoveryScanPayload,
  pageUrl: string,
): RawPostingCandidate[] {
  const containersByKey = new Map<string, ScannedCardContainer>();
  for (const container of scanPayload.cardContainers) {
    containersByKey.set(container.key, container);
  }

  // Choose the primary element per container: prefer href-bearing elements,
  // then the longest accessible name, preserving scan order as tie-breaker.
  // Only pre-routed open-posting elements reach this stage, so pagination and
  // overlay-close controls can never become posting candidates.
  const primaryElementByContainer = new Map<
    string,
    ScannedInteractiveElement
  >();
  const standaloneElementsByHref = new Map<string, ScannedInteractiveElement>();

  for (const element of openableElements) {
    const href = element.href;
    if (!href || !isUsableHttpUrl(href)) {
      continue;
    }

    if (element.containerKey) {
      const current = primaryElementByContainer.get(element.containerKey);
      if (
        !current ||
        element.accessibleName.length > current.accessibleName.length
      ) {
        primaryElementByContainer.set(element.containerKey, element);
      }
      continue;
    }

    if (!standaloneElementsByHref.has(href)) {
      standaloneElementsByHref.set(href, element);
    }
  }

  const candidates: RawPostingCandidate[] = [];

  for (const [containerKey, element] of primaryElementByContainer) {
    const candidate = buildDomCardPostingCandidate({
      container: containersByKey.get(containerKey) ?? null,
      element,
      pageUrl,
    });
    if (candidate) {
      candidates.push(candidate);
    }
  }

  for (const element of standaloneElementsByHref.values()) {
    const candidate = buildDomCardPostingCandidate({
      container: null,
      element,
      pageUrl,
    });
    if (candidate) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

function buildUncertaintyNotes(counts: {
  duplicatesMergedCount: number;
  omittedPostingCandidateCount: number;
  omittedPaginationCount: number;
  omittedActionCount: number;
  invalidPostingRowCount: number;
  accessibilitySnapshotUnavailable: boolean;
  textCaptureFailed: boolean;
  textTruncated: boolean;
  accessibilitySummaryTruncated: boolean;
}): string[] {
  const notes: string[] = [];

  if (counts.duplicatesMergedCount > 0) {
    notes.push(
      `${counts.duplicatesMergedCount} duplicate posting row(s) merged by canonical URL/source id composite.`,
    );
  }
  if (counts.omittedPostingCandidateCount > 0) {
    notes.push(
      `${counts.omittedPostingCandidateCount} unique posting candidate(s) omitted beyond the candidate bound.`,
    );
  }
  if (counts.omittedPaginationCount > 0) {
    notes.push(
      `${counts.omittedPaginationCount} pagination candidate(s) omitted beyond the pagination bound.`,
    );
  }
  if (counts.omittedActionCount > 0) {
    notes.push(
      `${counts.omittedActionCount} action candidate(s) omitted beyond the action bound.`,
    );
  }
  if (counts.invalidPostingRowCount > 0) {
    notes.push(
      `${counts.invalidPostingRowCount} posting row(s) failed contract validation and were dropped.`,
    );
  }
  if (counts.accessibilitySnapshotUnavailable) {
    notes.push("Accessibility snapshot was unavailable for this capture.");
  }
  if (counts.textCaptureFailed) {
    notes.push("Visible body text could not be read for this capture.");
  }
  if (counts.textTruncated) {
    notes.push("Visible text sample was truncated at the configured bound.");
  }
  if (counts.accessibilitySummaryTruncated) {
    notes.push(
      "Accessibility snapshot summary was truncated at the configured bound.",
    );
  }

  return notes
    .map((note) => note.slice(0, 600))
    .filter((note) => note.trim().length > 0)
    .slice(0, DISCOVERY_OBSERVATION_UNCERTAINTY_NOTES_MAX);
}
