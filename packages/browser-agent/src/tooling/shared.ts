import { z } from "zod";
import type { Locator, Page } from "playwright";
import type { AgentNavigationPolicy } from "../types";
import { isAllowedUrl } from "../allowlist";

export const MAX_NAVIGATION_TIMEOUT = 120_000;
const MAX_ACCESSIBLE_NAME_PATTERN_LENGTH = 200;
const BOUNDED_WHITESPACE_PATTERN = "(?:\\s{1,8})";
const INTERACTIVE_ELEMENT_LIMIT = 30;
const OVERLAY_CLOSE_TEXT_PATTERN =
  /^(?:x|close|dismiss|skip|cancel|join\s*now|not\s*now|maybe\s*later|no\s*thanks?|got\s*it|continue\s*to\s*site|continue)$/i;

export function canCaptureAriaSnapshot(
  value: unknown,
): value is { ariaSnapshot: () => Promise<unknown> } {
  return Boolean(
    value &&
      typeof value === "object" &&
      "ariaSnapshot" in value &&
      typeof value.ariaSnapshot === "function",
  );
}

export const NavigateSchema = z
  .object({
    url: z.string().url(),
    timeout: z.number().int().positive().max(MAX_NAVIGATION_TIMEOUT).optional().default(30000),
    waitFor: z.enum(["domcontentloaded", "load", "networkidle"]).optional().default("domcontentloaded"),
  })
  .strict();

const supportedInteractiveRoles = [
  "searchbox",
  "textbox",
  "combobox",
  "button",
  "link",
  "checkbox",
  "radio",
  "switch",
  "tab",
  "option",
  "menuitem",
  "listitem",
] as const;

const fillInteractiveRoles = ["searchbox", "textbox", "combobox"] as const;
const selectOptionInteractiveRoles = ["combobox", "option", "listitem"] as const;

function getRoleSearchOrder(role: SupportedInteractiveRole): SupportedInteractiveRole[] {
  switch (role) {
    case "button":
      return ["button", "link"];
    case "link":
      return ["link", "button"];
    case "textbox":
      return ["textbox", "searchbox", "combobox"];
    case "searchbox":
      return ["searchbox", "textbox", "combobox"];
    case "combobox":
      return ["combobox", "searchbox", "textbox"];
    default:
      return [role];
  }
}

export type SupportedInteractiveRole = (typeof supportedInteractiveRoles)[number];
const SupportedInteractiveRoleSchema = z.enum(supportedInteractiveRoles);
const FillRoleSchema = z.enum(fillInteractiveRoles);
const SelectOptionRoleSchema = z.enum(selectOptionInteractiveRoles);

function isSupportedInteractiveRole(role: string): role is SupportedInteractiveRole {
  return supportedInteractiveRoles.includes(role as SupportedInteractiveRole);
}

export const ClickSchema = z
  .object({
    role: SupportedInteractiveRoleSchema,
    name: z.string().trim().min(1),
    index: z.number().int().nonnegative().optional().default(0),
    retryIfNotVisible: z.boolean().optional().default(true),
  })
  .strict();

export const FillSchema = z
  .object({
    role: FillRoleSchema,
    name: z.string().trim().min(1),
    text: z.string().trim().min(1),
    index: z.number().int().nonnegative().optional().default(0),
    submit: z.boolean().optional().default(false),
  })
  .strict();

export const SelectOptionSchema = z
  .object({
    role: SelectOptionRoleSchema,
    name: z.string().trim().min(1),
    optionText: z.string().trim().min(1),
    index: z.number().int().nonnegative().optional().default(0),
    submit: z.boolean().optional().default(false),
  })
  .strict();

export const ScrollDownSchema = z
  .object({
    amount: z.number().int().positive().optional().default(800),
    delayMs: z.number().int().nonnegative().max(MAX_NAVIGATION_TIMEOUT).optional().default(1000),
  })
  .strict();

export const ScrollToTopSchema = z
  .object({
    delayMs: z.number().int().nonnegative().max(MAX_NAVIGATION_TIMEOUT).optional().default(800),
  })
  .strict();

export const GoBackSchema = z
  .object({})
  .strict();

export const ExtractJobsSchema = z
  .object({
    pageType: z.enum(["search_results", "job_detail", "company_page", "unknown"]),
    maxJobs: z.number().int().positive().optional().default(5),
  })
  .strict();

const FinishFindingListSchema = z.array(z.string().trim().min(1)).max(8).optional().default([]);

export const FinishSchema = z
  .object({
    reason: z.string().trim().min(1),
    summary: z.string().trim().min(1).optional(),
    reliableControls: FinishFindingListSchema,
    trickyFilters: FinishFindingListSchema,
    navigationTips: FinishFindingListSchema,
    applyTips: FinishFindingListSchema,
    warnings: FinishFindingListSchema,
  })
  .strict();

export interface InteractiveElementCandidate {
  role: string;
  name: string;
}

export interface OverlayDismissalResult {
  dismissedCount: number;
  dismissedLabels: string[];
}

function canEvaluatePage(page: Page): boolean {
  return typeof (page as { evaluate?: unknown }).evaluate === "function";
}

const INTERACTIVE_ELEMENT_ROLE_PRIORITY: Record<SupportedInteractiveRole, number> = {
  searchbox: 140,
  textbox: 120,
  combobox: 110,
  button: 90,
  link: 80,
  checkbox: 70,
  radio: 70,
  switch: 65,
  tab: 60,
  option: 55,
  menuitem: 50,
  listitem: 45,
};

const INTERACTIVE_ELEMENT_PRIORITY_PATTERNS = [
  { pattern: /\b(show|see|view)\s+all\b/i, boost: 260 },
  { pattern: /\bsearch\b/i, boost: 220 },
  { pattern: /\bfilter(s)?\b/i, boost: 220 },
  { pattern: /\blocation\b/i, boost: 210 },
  { pattern: /\bindustry\b/i, boost: 210 },
  { pattern: /\bcategory\b/i, boost: 200 },
  { pattern: /\bdepartment\b/i, boost: 200 },
  { pattern: /\bexperience\b/i, boost: 190 },
  { pattern: /\b(remote|hybrid|on[- ]site|work mode)\b/i, boost: 180 },
  { pattern: /\b(recommended|recommendation|collection|collections|top job picks)\b/i, boost: 175 },
  { pattern: /\bjob(s)?\b/i, boost: 150 },
  { pattern: /\b(next|load more|more results|see more|browse)\b/i, boost: 140 },
  { pattern: /\bapply\b/i, boost: 80 },
];

const INTERACTIVE_ELEMENT_NOISE_PATTERNS = [
  { pattern: /^(home|my network|messaging|notifications|me)$/i, penalty: 240 },
  { pattern: /^(for business|try premium.*|premium)$/i, penalty: 220 },
  { pattern: /\b(feed|advertisement|ad choice|sponsored)\b/i, penalty: 180 },
];

function normalizeInteractiveName(value: string): string {
  return value.replace(/\s+/g, " ").replace(/[→←↗↘↙↖›»]+$/g, "").trim();
}

function scoreOverlayDismissCandidate(label: string): number {
  const normalized = normalizeInteractiveName(label);
  if (!normalized) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;
  if (OVERLAY_CLOSE_TEXT_PATTERN.test(normalized)) {
    score += 300;
  }

  if (/^x$/i.test(normalized)) {
    score += 80;
  }

  if (/\b(close|dismiss|skip|cancel)\b/i.test(normalized)) {
    score += 120;
  }

  score -= Math.min(normalized.length, 120) / 4;
  return score;
}

export async function dismissObstructiveOverlays(page: Page): Promise<OverlayDismissalResult> {
  const dismissedLabels: string[] = [];

  if (!canEvaluatePage(page)) {
    return {
      dismissedCount: 0,
      dismissedLabels,
    };
  }

  for (let pass = 0; pass < 2; pass += 1) {
    let candidates: Array<{ label: string; role: string }> = [];
    try {
      const evaluatedCandidates = await page.evaluate(() => {
        const isVisible = (element: HTMLElement): boolean => {
          if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
          const style = window.getComputedStyle(element);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            style.visibility === "collapse" ||
            Number(style.opacity || "1") < 0.05 ||
            style.pointerEvents === "none"
          ) {
            return false;
          }

          const rect = element.getBoundingClientRect();
          return rect.width >= 16 && rect.height >= 16;
        };

        const readLabel = (element: HTMLElement): string => {
          const labelledBy = element.getAttribute("aria-labelledby");
          const labelledByText = labelledBy
            ? labelledBy
                .split(/\s+/)
                .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
                .filter(Boolean)
                .join(" ")
            : "";

          return (
            element.getAttribute("aria-label")?.trim() ||
            element.getAttribute("title")?.trim() ||
            labelledByText ||
            element.textContent?.replace(/\s+/g, " ").trim() ||
            ""
          );
        };

        const selectors = [
          '[role="dialog"] button, [role="dialog"] [role="button"], [role="dialog"] a[href]',
          '[aria-modal="true"] button, [aria-modal="true"] [role="button"], [aria-modal="true"] a[href]',
          '[class*="modal"] button, [class*="modal"] [role="button"], [class*="modal"] a[href]',
          '[class*="popup"] button, [class*="popup"] [role="button"], [class*="popup"] a[href]',
          '[class*="overlay"] button, [class*="overlay"] [role="button"], [class*="overlay"] a[href]',
          '[class*="interstitial"] button, [class*="interstitial"] [role="button"], [class*="interstitial"] a[href]',
          '[style*="position: fixed"] button, [style*="position: fixed"] [role="button"], [style*="position: fixed"] a[href]',
          '[style*="position:fixed"] button, [style*="position:fixed"] [role="button"], [style*="position:fixed"] a[href]',
        ];

        return Array.from(document.querySelectorAll<HTMLElement>(selectors.join(", ")))
          .filter((element) => isVisible(element))
          .map((element) => ({
            label: readLabel(element),
            role: element.getAttribute("role")?.trim().toLowerCase() ?? element.tagName.toLowerCase(),
          }));
      });
      candidates = Array.isArray(evaluatedCandidates) ? evaluatedCandidates : [];
    } catch {
      candidates = [];
    }

    const bestCandidate = candidates
      .map((candidate) => ({ ...candidate, score: scoreOverlayDismissCandidate(candidate.label) }))
      .sort((left, right) => right.score - left.score)[0];

    if (!bestCandidate || bestCandidate.score < 140) {
      break;
    }

    const clicked = await (async () => {
      const exactLabel = normalizeInteractiveName(bestCandidate.label);
      const exactLocator = exactLabel
        ? page.getByRole("button", { name: exactLabel, exact: true }).first()
        : null;
      if (exactLocator && (await exactLocator.count().catch(() => 0)) > 0) {
        try {
          await exactLocator.click({ timeout: 1500 });
          return true;
        } catch {
          // Try looser locators before giving up on the overlay candidate.
        }
      }

      const looseLocator = exactLabel
        ? page.getByRole("button", { name: buildLooseAccessibleNamePattern(exactLabel) }).first()
        : null;
      if (looseLocator && (await looseLocator.count().catch(() => 0)) > 0) {
        try {
          await looseLocator.click({ timeout: 1500 });
          return true;
        } catch {
          // Fall through to the broad text locator as a last resort.
        }
      }

      const fallbackLocator = exactLabel
        ? page.locator("button, [role='button'], a[href]").filter({ hasText: buildLooseAccessibleNamePattern(exactLabel) }).first()
        : null;
      if (fallbackLocator && (await fallbackLocator.count().catch(() => 0)) > 0) {
        try {
          await fallbackLocator.click({ timeout: 1500 });
          return true;
        } catch {
          return false;
        }
      }

      return false;
    })();

    if (!clicked) {
      break;
    }

    dismissedLabels.push(bestCandidate.label);
    await page.waitForTimeout(250).catch(() => undefined);
  }

  return {
    dismissedCount: dismissedLabels.length,
    dismissedLabels,
  };
}

function makeInteractiveElementKey(role: string, name: string): string {
  return `${role.trim().toLowerCase()}:${normalizeInteractiveName(name).toLowerCase()}`;
}

export function mergeInteractiveElementCandidates(
  ...candidateLists: Array<readonly InteractiveElementCandidate[]>
): InteractiveElementCandidate[] {
  const merged = new Map<string, { role: string; name: string; counts: number[]; order: number }>();
  let order = 0;

  candidateLists.forEach((candidateList, listIndex) => {
    const counts = new Map<string, number>();

    for (const candidate of candidateList) {
      const role = candidate.role.trim().toLowerCase();
      const name = normalizeInteractiveName(candidate.name);

        if (!role || !name || !isSupportedInteractiveRole(role)) {
          continue;
        }

      const key = makeInteractiveElementKey(role, name);
      const nextCount = (counts.get(key) ?? 0) + 1;
      counts.set(key, nextCount);

      const existing = merged.get(key);
      if (existing) {
        existing.counts[listIndex] = nextCount;
        continue;
      }

      const sourceCounts = new Array(candidateLists.length).fill(0);
      sourceCounts[listIndex] = nextCount;
      merged.set(key, { role, name, counts: sourceCounts, order });
      order += 1;
    }
  });

  return [...merged.values()]
    .sort((left, right) => left.order - right.order)
    .flatMap((entry) => {
      const maxCount = Math.max(...entry.counts, 1);
      return Array.from({ length: maxCount }, () => ({ role: entry.role, name: entry.name }));
    });
}

function scoreInteractiveElement(candidate: InteractiveElementCandidate): number {
  const normalizedName = normalizeInteractiveName(candidate.name);
  const compactName = normalizedName.toLowerCase();
  const normalizedRole = candidate.role.trim().toLowerCase();

  let score = isSupportedInteractiveRole(normalizedRole)
    ? INTERACTIVE_ELEMENT_ROLE_PRIORITY[normalizedRole]
    : 40;

  for (const { pattern, boost } of INTERACTIVE_ELEMENT_PRIORITY_PATTERNS) {
    if (pattern.test(normalizedName)) {
      score += boost;
    }
  }

  for (const { pattern, penalty } of INTERACTIVE_ELEMENT_NOISE_PATTERNS) {
    if (pattern.test(normalizedName)) {
      score -= penalty;
    }
  }

  if (compactName.length <= 1) {
    score -= 80;
  } else if (compactName.length <= 3) {
    score -= 30;
  }

  return score;
}

export function parseInteractiveElementsFromAriaSnapshot(snapshot: string): InteractiveElementCandidate[] {
  const elements: InteractiveElementCandidate[] = [];

  for (const line of snapshot.split("\n")) {
    const match = line.match(/-\s+([\w-]+)\s+"([^"]+)"(?:\s+\[ref=[^\]]+\])?/);
    if (!match) {
      continue;
    }

    const role = match[1]?.trim().toLowerCase();
    const name = normalizeInteractiveName(match[2] ?? "");

    if (!role || !name || !isSupportedInteractiveRole(role)) {
      continue;
    }

    elements.push({ role, name });
  }

  return elements;
}

export function prioritizeInteractiveElements(
  candidates: readonly InteractiveElementCandidate[],
  limit = INTERACTIVE_ELEMENT_LIMIT,
): Array<InteractiveElementCandidate & { index: number }> {
  const scored = candidates
    .filter((candidate) => isSupportedInteractiveRole(candidate.role.trim().toLowerCase()))
    .map((candidate, order) => ({ ...candidate, order, score: scoreInteractiveElement(candidate) }));

  scored.sort((left, right) => right.score - left.score || left.order - right.order);

  const roleNameIndices = new Map<string, number>();

  return scored.slice(0, limit).map((candidate) => {
    const key = makeInteractiveElementKey(candidate.role, candidate.name);
    const index = roleNameIndices.get(key) ?? 0;
    roleNameIndices.set(key, index + 1);
    return { role: candidate.role, name: candidate.name, index };
  });
}

export function buildLooseAccessibleNamePattern(name: string): RegExp {
  const trimmedName = normalizeInteractiveName(name);
  if (!trimmedName) {
    return /^$/i;
  }

  const safeName = trimmedName.slice(0, MAX_ACCESSIBLE_NAME_PATTERN_LENGTH);
  const escapedName = safeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const whitespaceTolerantName = escapedName.replace(/\s+/g, BOUNDED_WHITESPACE_PATTERN);
  return new RegExp(whitespaceTolerantName, "i");
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizeLooseLocatorName(value: string): string {
  return normalizeInteractiveName(value)
    .toLowerCase()
    .replace(/\bverified job\b/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleCaseWords(value: string): string {
  return value.replace(/\b\p{L}[\p{L}\p{N}]*/gu, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

function looseLocatorNameMatches(target: string, candidate: string): boolean {
  const normalizedTarget = normalizeLooseLocatorName(target);
  const normalizedCandidate = normalizeLooseLocatorName(candidate);

  if (!normalizedTarget || !normalizedCandidate) {
    return false;
  }

  if (
    normalizedCandidate.includes(normalizedTarget) ||
    normalizedTarget.includes(normalizedCandidate)
  ) {
    return true;
  }

  const targetTokens = normalizedTarget.split(' ').filter(Boolean);
  return targetTokens.length >= 2 && targetTokens.every((token) => normalizedCandidate.includes(token));
}

async function findVisibleLocator(
  locator: Locator,
  visibleIndex: number,
): Promise<Locator | null> {
  const count = await locator.count().catch(() => 0);
  let matchedVisibleCount = 0;

  for (let candidateIndex = 0; candidateIndex < count; candidateIndex += 1) {
    const candidate = locator.nth(candidateIndex);
    const visible = await candidate.isVisible().catch(() => false);

    if (!visible) {
      continue;
    }

    if (matchedVisibleCount === visibleIndex) {
      return candidate;
    }

    matchedVisibleCount += 1;
  }

  return null;
}

async function readLocatorAccessibleName(locator: Locator): Promise<string | null> {
  return locator.evaluate((element) => {
    const readLabelledByText = (target: Element): string => {
      const labelledBy = target.getAttribute('aria-labelledby')
      if (!labelledBy) return ''
      return labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .filter(Boolean)
        .join(' ')
    }

    const ariaLabel = element.getAttribute('aria-label')?.trim()
    if (ariaLabel) return ariaLabel

    const labelledByText = readLabelledByText(element)
    if (labelledByText) return labelledByText

    if ('labels' in element) {
      const labels = Array.from((element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).labels ?? [])
        .map((label) => label.textContent?.trim() ?? '')
        .filter(Boolean)
      if (labels.length > 0) return labels.join(' ')
    }

    const placeholder = element.getAttribute('placeholder')?.trim()
    if (placeholder) return placeholder

    const title = element.getAttribute('title')?.trim()
    if (title) return title

    if (element instanceof HTMLInputElement) {
      const value = element.value.trim()
      if (value) return value
    }

    const innerText = element instanceof HTMLElement ? element.innerText.trim() : ''
    if (innerText) return innerText

    return (element.textContent ?? '').replace(/\s+/g, ' ').trim() || null
  }).catch(() => null)
}

async function findLooselyMatchingVisibleLocator(
  page: Page,
  roles: readonly SupportedInteractiveRole[],
  candidateNames: readonly string[],
  visibleIndex: number,
): Promise<ReturnType<Page['getByRole']> | null> {
  let matchedVisibleCount = 0

  for (const role of roles) {
    const broadLocator = page.getByRole(role)
    const count = await broadLocator.count().catch(() => 0)

    for (let candidateIndex = 0; candidateIndex < count; candidateIndex += 1) {
      const candidate = broadLocator.nth(candidateIndex)
      const visible = await candidate.isVisible().catch(() => false)

      if (!visible) {
        continue
      }

      const accessibleName = await readLocatorAccessibleName(candidate)
      if (!accessibleName || !candidateNames.some((name) => looseLocatorNameMatches(name, accessibleName))) {
        continue
      }

      if (matchedVisibleCount === visibleIndex) {
        return candidate
      }

      matchedVisibleCount += 1
    }
  }

  return null
}

function logComboboxDebug(action: string, optionText: string, error: unknown): void {
  console.debug(`[Agent] fillComboboxValue ${action} failed`, {
    error,
    optionText,
  })
}

async function locatorContainsActiveElement(locator: Locator): Promise<boolean> {
  try {
    return await locator.evaluate((element) => {
      const activeElement = document.activeElement
      return Boolean(activeElement && (element === activeElement || element.contains(activeElement)))
    })
  } catch {
    return false
  }
}

export async function fillComboboxValue(locator: Locator, page: Page, optionText: string): Promise<boolean> {
  const inputLocator = locator.locator("input, textarea").first();
  const inputCount = await inputLocator.count().catch((error) => {
    logComboboxDebug('count input', optionText, error)
    return 0
  });

  if (inputCount > 0) {
    await inputLocator.click().catch((error) => {
      logComboboxDebug('click input', optionText, error)
      return undefined
    });
    try {
      await inputLocator.fill(optionText)
      return true
    } catch (error) {
      logComboboxDebug('fill input', optionText, error)
      const inputIsActive = await locatorContainsActiveElement(inputLocator)
      if (!inputIsActive) {
        logComboboxDebug('input not active', optionText, new Error('Input did not receive focus'))
        return false
      }

      const didSelectExistingText = await page.keyboard.press("ControlOrMeta+A").then(() => true).catch((keyboardError) => {
        logComboboxDebug('keyboard press', optionText, keyboardError)
        return false
      });
      if (!didSelectExistingText) {
        return false
      }
      return await page.keyboard.type(optionText).then(() => true).catch((keyboardError) => {
        logComboboxDebug('keyboard type', optionText, keyboardError)
        return false
      });
    }
  }

  await locator.click().catch((error) => {
    logComboboxDebug('locator click', optionText, error)
    return locator.focus().catch((focusError) => {
      logComboboxDebug('locator focus', optionText, focusError)
      return undefined
    })
  });
  const locatorIsActive = await locatorContainsActiveElement(locator)
  if (!locatorIsActive) {
    logComboboxDebug('target not active', optionText, new Error('Combobox did not receive focus'))
    return false
  }
  return await page.keyboard.type(optionText).then(() => true).catch((error) => {
    logComboboxDebug('keyboard type', optionText, error)
    return false
  });
}

export function buildComboboxOptionScopes(page: Page, popupId: string | null): Locator[] {
  if (popupId) {
    return [page.locator(`[id="${escapeAttributeValue(popupId)}"]`)];
  }

  return [page.locator("body")];
}

export async function clickMatchingComboboxOption(scopes: readonly Locator[], optionText: string): Promise<boolean> {
  const optionPattern = buildLooseAccessibleNamePattern(optionText);

  for (const scope of scopes) {
    const semanticOptions = scope.getByRole("option", { name: optionPattern });
    const semanticOptionCount = await semanticOptions.count().catch(() => 0);

    if (semanticOptionCount > 0) {
      await semanticOptions.first().click();
      return true;
    }

    const fallbackOptions = scope.locator('[role="option"], [role="listitem"], li, button').filter({ hasText: optionPattern });
    const fallbackOptionCount = await fallbackOptions.count().catch(() => 0);

    if (fallbackOptionCount > 0) {
      await fallbackOptions.first().click();
      return true;
    }
  }

  return false;
}

export async function readComboboxSelection(locator: Locator): Promise<{ selectedLabel: string | null; selectedValue: string | null }> {
  return locator.evaluate((element) => {
    const input =
      element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
        ? element
        : (element.querySelector("input, textarea") as HTMLInputElement | HTMLTextAreaElement | null);

    const activeDescendantId = input?.getAttribute("aria-activedescendant") ?? element.getAttribute("aria-activedescendant");
    const activeDescendant = activeDescendantId ? document.getElementById(activeDescendantId) : null;
    const selectedLabel = [
      activeDescendant?.textContent,
      input?.value,
      element.getAttribute("aria-valuetext"),
      element.getAttribute("value"),
      element.textContent,
    ].find((value) => typeof value === "string" && value.trim().length > 0);

    return {
      selectedLabel: selectedLabel?.trim() ?? null,
      selectedValue: input?.value?.trim() ?? element.getAttribute("value")?.trim() ?? null,
    };
  });
}

export async function resolveRoleLocator(
  page: Page,
  role: SupportedInteractiveRole,
  name: string,
  index: number,
): Promise<ReturnType<Page["getByRole"]>> {
  const roleSearchOrder = getRoleSearchOrder(role)
  const baseName = normalizeInteractiveName(name)
  const alternateNames = new Set<string>([baseName])

  if (role === 'button') {
    if (/\ball filters\b/i.test(baseName)) {
      alternateNames.add(baseName.replace(/\ball filters\b/i, 'show all filters'))
      alternateNames.add(baseName.replace(/\ball filters\b/i, 'Show all filters'))
    }

    if (/\bshow all filters\b/i.test(baseName)) {
      alternateNames.add(baseName.replace(/\bshow all filters\b/i, 'all filters'))
      alternateNames.add(baseName.replace(/\bshow all filters\b/i, 'All filters'))
    }
  }

  if (role === 'link') {
    alternateNames.add(baseName.replace(/\s*\(verified job\)\s*/gi, ' ').replace(/\s+/g, ' ').trim())
    alternateNames.add(baseName.replace(/\s*verified job\s*/gi, ' ').replace(/\s+/g, ' ').trim())
    if (!/verified job/i.test(baseName)) {
      alternateNames.add(`${baseName} (Verified job)`.trim())
      alternateNames.add(`${baseName} Verified job`.trim())
    }
  }

  alternateNames.add(titleCaseWords(baseName))
  let hiddenFallback: ReturnType<Page["getByRole"]> | null = null

  for (const candidateRole of roleSearchOrder) {
    for (const candidateName of alternateNames) {
      if (!candidateName) {
        continue
      }

      const exactLocator = page.getByRole(candidateRole, { name: candidateName, exact: true });
      const exactCount = await exactLocator.count().catch(() => 0);
      const exactVisibleLocator = await findVisibleLocator(exactLocator, index);

      if (exactVisibleLocator) {
        return exactVisibleLocator;
      }

      if (exactCount > index && hiddenFallback === null) {
        hiddenFallback = exactLocator;
      }

      const looseLocator = page.getByRole(candidateRole, { name: buildLooseAccessibleNamePattern(candidateName) });
      const looseCount = await looseLocator.count().catch(() => 0);
      const looseVisibleLocator = await findVisibleLocator(looseLocator, index);

      if (looseVisibleLocator) {
        return looseVisibleLocator;
      }

      if (looseCount > index && hiddenFallback === null) {
        hiddenFallback = looseLocator;
      }
    }
  }

  const looseVisibleLocator = await findLooselyMatchingVisibleLocator(page, roleSearchOrder, [...alternateNames], index)
  if (looseVisibleLocator) {
    return looseVisibleLocator
  }

  if (hiddenFallback) {
    return hiddenFallback.nth(index)
  }

  throw new Error(`No ${role} matched accessible name "${name}".`);
}

export async function recoverFromOffAllowlist(
  page: Page,
  invalidUrl: string,
  previousUrl: string,
  policy: AgentNavigationPolicy,
): Promise<{ recovered: boolean; error: string; recoveredUrl?: string }> {
  const error = `Navigation went to disallowed URL: ${invalidUrl}`;
  const previousUrlValid = previousUrl && isAllowedUrl(previousUrl, policy).valid;

  try {
    await page.goBack({ waitUntil: "domcontentloaded", timeout: 5000 });
    await page.waitForTimeout(500);

    const currentUrl = page.url();
    const urlCheck = isAllowedUrl(currentUrl, policy);
    if (urlCheck.valid) {
      return { recovered: true, error, recoveredUrl: currentUrl };
    }
  } catch {
    // goBack failed, try direct navigation
  }

  if (previousUrlValid) {
    try {
      await page.goto(previousUrl, { waitUntil: "domcontentloaded", timeout: 5000 });

      const finalUrl = page.url();
      const urlCheck = isAllowedUrl(finalUrl, policy);
      if (urlCheck.valid) {
        return { recovered: true, error: error + ` (recovered to ${previousUrl})`, recoveredUrl: finalUrl };
      }
    } catch {
      // direct recovery failed
    }
  }

  if (!previousUrlValid) {
    return { recovered: false, error: error + " (no previous allowed URL to recover to)" };
  }

  return { recovered: false, error: error + " (recovery failed)" };
}
