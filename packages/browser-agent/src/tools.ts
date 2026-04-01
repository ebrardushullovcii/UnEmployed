import { z } from "zod";
import type { Page } from "playwright";
import type { AgentNavigationPolicy, ToolDefinition } from "./types";
import { isAllowedUrl } from "./allowlist";

// Maximum timeout for navigation operations (2 minutes)
export const MAX_NAVIGATION_TIMEOUT = 120_000;

// Tool payload schemas
const NavigateSchema = z
  .object({
    url: z.string().url(),
    timeout: z
      .number()
      .int()
      .positive()
      .max(MAX_NAVIGATION_TIMEOUT)
      .optional()
      .default(30000),
    waitFor: z
      .enum(["domcontentloaded", "load", "networkidle"])
      .optional()
      .default("domcontentloaded"),
  })
  .strict();

const ClickSchema = z
  .object({
    role: z.string().min(1),
    name: z.string().min(1),
    index: z.number().int().nonnegative().optional().default(0),
    retryIfNotVisible: z.boolean().optional().default(true),
  })
  .strict();

const FillSchema = z
  .object({
    role: z.string().min(1),
    name: z.string().min(1),
    text: z.string().min(1),
    index: z.number().int().nonnegative().optional().default(0),
    submit: z.boolean().optional().default(false),
  })
  .strict();

const SelectOptionSchema = z
  .object({
    role: z.string().min(1),
    name: z.string().min(1),
    optionText: z.string().min(1),
    index: z.number().int().nonnegative().optional().default(0),
    submit: z.boolean().optional().default(false),
  })
  .strict();

const ScrollDownSchema = z
  .object({
    amount: z.number().int().positive().optional().default(800),
  })
  .strict();

const ScrollToTopSchema = z.object({}).strict();

const ExtractJobsSchema = z
  .object({
    pageType: z.enum([
      "search_results",
      "job_detail",
      "company_page",
      "unknown",
    ]),
    maxJobs: z.number().int().positive().optional().default(5),
  })
  .strict();

const FinishFindingListSchema = z
  .array(z.string().min(1))
  .max(8)
  .optional()
  .default([]);

const FinishSchema = z
  .object({
    reason: z.string().min(1),
    summary: z.string().min(1).optional(),
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

const INTERACTIVE_ELEMENT_LIMIT = 30;
const INTERACTIVE_ELEMENT_ROLE_PRIORITY: Record<string, number> = {
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
};

const INTERACTIVE_ELEMENT_PRIORITY_PATTERNS: Array<{
  pattern: RegExp;
  boost: number;
}> = [
  { pattern: /\b(show|see|view)\s+all\b/i, boost: 260 },
  { pattern: /\bsearch\b/i, boost: 220 },
  { pattern: /\bfilter(s)?\b/i, boost: 220 },
  { pattern: /\blocation\b/i, boost: 210 },
  { pattern: /\bindustry\b/i, boost: 210 },
  { pattern: /\bcategory\b/i, boost: 200 },
  { pattern: /\bdepartment\b/i, boost: 200 },
  { pattern: /\bexperience\b/i, boost: 190 },
  { pattern: /\b(remote|hybrid|on[- ]site|work mode)\b/i, boost: 180 },
  {
    pattern:
      /\b(recommended|recommendation|collection|collections|top job picks)\b/i,
    boost: 175,
  },
  { pattern: /\bjob(s)?\b/i, boost: 150 },
  { pattern: /\b(next|load more|more results|see more|browse)\b/i, boost: 140 },
  { pattern: /\bapply\b/i, boost: 80 },
];

const INTERACTIVE_ELEMENT_NOISE_PATTERNS: Array<{
  pattern: RegExp;
  penalty: number;
}> = [
  { pattern: /^(home|my network|messaging|notifications|me)$/i, penalty: 240 },
  { pattern: /^(for business|try premium.*|premium)$/i, penalty: 220 },
  { pattern: /\b(feed|advertisement|ad choice|sponsored)\b/i, penalty: 180 },
];

function normalizeInteractiveName(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/[→←↗↘↙↖›»]+$/g, "")
    .trim();
}

function makeInteractiveElementKey(role: string, name: string): string {
  return `${role.trim().toLowerCase()}:${normalizeInteractiveName(name).toLowerCase()}`;
}

function mergeInteractiveElementCandidates(
  ...candidateLists: Array<readonly InteractiveElementCandidate[]>
): InteractiveElementCandidate[] {
  const merged = new Map<
    string,
    { role: string; name: string; counts: number[]; order: number }
  >();
  let order = 0;

  candidateLists.forEach((candidateList, listIndex) => {
    const counts = new Map<string, number>();

    for (const candidate of candidateList) {
      const role = candidate.role.trim().toLowerCase();
      const name = normalizeInteractiveName(candidate.name);

      if (!role || !name) {
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
      return Array.from({ length: maxCount }, () => ({
        role: entry.role,
        name: entry.name,
      }));
    });
}

function scoreInteractiveElement(
  candidate: InteractiveElementCandidate,
): number {
  const normalizedName = normalizeInteractiveName(candidate.name);
  const compactName = normalizedName.toLowerCase();
  const normalizedRole = candidate.role.trim().toLowerCase();

  let score = INTERACTIVE_ELEMENT_ROLE_PRIORITY[normalizedRole] ?? 40;

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

export function parseInteractiveElementsFromAriaSnapshot(
  snapshot: string,
): InteractiveElementCandidate[] {
  const elements: InteractiveElementCandidate[] = [];

  for (const line of snapshot.split("\n")) {
    const match = line.match(/-\s+([\w-]+)\s+"([^"]+)"(?:\s+\[ref=[^\]]+\])?/);
    if (!match) {
      continue;
    }

    const role = match[1]?.trim().toLowerCase();
    const name = normalizeInteractiveName(match[2] ?? "");

    if (!role || !name) {
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
  const scored = candidates.map((candidate, order) => ({
    ...candidate,
    order,
    score: scoreInteractiveElement(candidate),
  }));

  scored.sort(
    (left, right) => right.score - left.score || left.order - right.order,
  );

  const roleNameIndices = new Map<string, number>();

  return scored.slice(0, limit).map((candidate) => {
    const key = makeInteractiveElementKey(candidate.role, candidate.name);
    const index = roleNameIndices.get(key) ?? 0;
    roleNameIndices.set(key, index + 1);
    return {
      role: candidate.role,
      name: candidate.name,
      index,
    };
  });
}

function buildLooseAccessibleNamePattern(name: string): RegExp {
  const trimmedName = normalizeInteractiveName(name);
  const escapedName = trimmedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const whitespaceTolerantName = escapedName.replace(/\s+/g, "\\s+");
  return new RegExp(whitespaceTolerantName, "i");
}

async function resolveRoleLocator(
  page: Page,
  role: string,
  name: string,
  index: number,
): Promise<ReturnType<Page["getByRole"]>> {
  const exactLocator = page.getByRole(
    role as Parameters<typeof page.getByRole>[0],
    { name, exact: true },
  );
  const exactCount = await exactLocator.count().catch(() => 0);

  if (exactCount > index) {
    return exactLocator.nth(index);
  }

  const looseLocator = page.getByRole(
    role as Parameters<typeof page.getByRole>[0],
    {
      name: buildLooseAccessibleNamePattern(name),
    },
  );
  const looseCount = await looseLocator.count().catch(() => 0);

  if (looseCount > index) {
    return looseLocator.nth(index);
  }

  return exactLocator.nth(index);
}

// Recovery helper for when navigation goes off allowlist
async function recoverFromOffAllowlist(
  page: Page,
  invalidUrl: string,
  previousUrl: string,
  policy: AgentNavigationPolicy,
): Promise<{ recovered: boolean; error: string; recoveredUrl?: string }> {
  const error = `Navigation went to disallowed URL: ${invalidUrl}`;

  // Check if previousUrl is valid for recovery
  const previousUrlValid =
    previousUrl && isAllowedUrl(previousUrl, policy).valid;

  // Try to go back
  try {
    await page.goBack({ waitUntil: "domcontentloaded", timeout: 5000 });
    await page.waitForTimeout(500);

    // Verify we landed on an allowed URL
    const currentUrl = page.url();
    const urlCheck = isAllowedUrl(currentUrl, policy);
    if (urlCheck.valid) {
      return { recovered: true, error, recoveredUrl: currentUrl };
    }
  } catch {
    // goBack failed, try direct navigation
  }

  // If still off-allowlist, try to navigate to the previous allowed URL
  if (previousUrlValid) {
    try {
      await page.goto(previousUrl, {
        waitUntil: "domcontentloaded",
        timeout: 5000,
      });

      // Verify we landed on an allowed URL
      const finalUrl = page.url();
      const urlCheck = isAllowedUrl(finalUrl, policy);
      if (urlCheck.valid) {
        return {
          recovered: true,
          error: error + ` (recovered to ${previousUrl})`,
          recoveredUrl: finalUrl,
        };
      }
    } catch {
      // Navigation also failed
    }
  }

  // Recovery failed - provide clear error based on whether previousUrl was available
  if (!previousUrlValid) {
    return {
      recovered: false,
      error: error + " (no previous allowed URL to recover to)",
    };
  }

  return { recovered: false, error: error + " (recovery failed)" };
}

export const browserTools: ToolDefinition[] = [
  {
    name: "navigate",
    description: `Navigate to a URL. Use this to go to job sites or specific pages.
    
You control the timeout strategy:
- For fast pages: use timeout 5000 (5 seconds)
- For slow pages: use timeout 30000 (30 seconds)  
- If a page times out, you can decide whether to retry, wait longer, or proceed anyway based on the partialLoad info returned.`,
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to navigate to",
        },
        timeout: {
          type: "number",
          description:
            "Timeout in milliseconds (default: 30000). Use shorter timeouts (5000-10000) for faster navigation, longer (30000+) for heavy pages.",
          default: 30000,
        },
        waitFor: {
          type: "string",
          enum: ["domcontentloaded", "load", "networkidle"],
          description:
            'What to wait for before considering navigation complete. Use "domcontentloaded" for speed, "networkidle" for full page load.',
          default: "domcontentloaded",
        },
      },
      required: ["url"],
    },
    execute: async (args, context) => {
      // Validate args against schema
      const parseResult = NavigateSchema.safeParse(args);
      if (!parseResult.success) {
        return {
          success: false,
          error: `Invalid navigate arguments: ${parseResult.error.issues.map((i) => i.message).join(", ")}`,
        };
      }
      const { url, timeout, waitFor } = parseResult.data;

      const { page, state } = context;
      const startTime = Date.now();

      // Validate URL before navigation
      const urlValidation = isAllowedUrl(url, context.config.navigationPolicy);
      if (!urlValidation.valid) {
        return {
          success: false,
          error: urlValidation.error ?? "URL validation failed",
        };
      }

      try {
        await page.goto(url, {
          waitUntil: waitFor,
          timeout,
        });

        const finalUrl = page.url();
        const loadTime = Date.now() - startTime;

        // Validate final URL after navigation (redirects could escape allowlist)
        const finalUrlValidation = isAllowedUrl(
          finalUrl,
          context.config.navigationPolicy,
        );
        if (!finalUrlValidation.valid) {
          // Redirect went off-allowlist - use recovery helper
          const recovery = await recoverFromOffAllowlist(
            page,
            finalUrl,
            state.currentUrl,
            context.config.navigationPolicy,
          );
          // Only update state if recovery was successful and landed on allowed URL
          if (
            recovery.recovered &&
            recovery.recoveredUrl &&
            isAllowedUrl(recovery.recoveredUrl, context.config.navigationPolicy)
              .valid
          ) {
            state.currentUrl = recovery.recoveredUrl;
          }
          return {
            success: false,
            error: recovery.error,
            data: {
              requestedUrl: url,
              finalUrl: finalUrl,
              recovered: recovery.recovered,
            },
          };
        }

        state.currentUrl = finalUrl;
        state.visitedUrls.add(finalUrl);

        return {
          success: true,
          data: {
            url: finalUrl,
            title: await page.title(),
            loadTimeMs: loadTime,
            waitState: waitFor,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Navigation failed";
        const currentUrl = page.url();

        // Check if we ended up on a disallowed URL and recover
        let finalUrl = currentUrl;
        if (currentUrl) {
          const urlCheck = isAllowedUrl(
            currentUrl,
            context.config.navigationPolicy,
          );
          if (!urlCheck.valid) {
            // Try to recover back to an allowed URL
            const recovery = await recoverFromOffAllowlist(
              page,
              currentUrl,
              state.currentUrl,
              context.config.navigationPolicy,
            );
            if (recovery.recovered && recovery.recoveredUrl) {
              finalUrl = recovery.recoveredUrl;
            }
          }
        }

        // Check for partial load by evaluating document state
        let readyState = "unknown";
        let isPartialLoad = false;

        try {
          // Page may be in a bad state after navigation failure
          readyState = await page
            .evaluate(() => document.readyState)
            .catch(() => "unknown");
          // Partial load if URL changed or document isn't fully loaded
          isPartialLoad = Boolean(
            finalUrl &&
            finalUrl !== "about:blank" &&
            (finalUrl !== url || readyState !== "complete"),
          );
        } catch {
          // Fallback to URL-based check if evaluate fails
          isPartialLoad = Boolean(
            finalUrl && finalUrl !== "about:blank" && finalUrl !== url,
          );
        }

        // Update state to reflect current URL after recovery
        if (
          finalUrl &&
          isAllowedUrl(finalUrl, context.config.navigationPolicy).valid
        ) {
          state.currentUrl = finalUrl;
        }

        return {
          success: false,
          error: errorMessage,
          data: {
            requestedUrl: url,
            currentUrl: finalUrl || null,
            partialLoad: isPartialLoad,
            readyState,
            timeElapsed: Date.now() - startTime,
            errorType: errorMessage.includes("timeout")
              ? "timeout"
              : "navigation_error",
          },
        };
      }
    },
  },

  {
    name: "get_interactive_elements",
    description: `Get a list of interactive elements on the page with their accessibility role, name, and occurrence index.

Use this to understand what's clickable, fillable, or scrollable on the page.
Returns elements with role, name, and index that you can use with click(role, name, index) or fill(role, name, index) tools.

Example: { role: 'button', name: 'Apply', index: 0 } can be clicked with click('button', 'Apply', 0)

Note: If multiple elements have the same role and name, use the index (0-based) to disambiguate which one to interact with.`,
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async (_args, context) => {
      const { page } = context;

      try {
        const snapshot = await page
          .locator("body")
          .ariaSnapshot()
          .catch(() => "");
        const ariaElements = snapshot
          ? parseInteractiveElementsFromAriaSnapshot(snapshot)
          : [];
        const domElements = await page.evaluate(() => {
          const roleFromInputType = (element: HTMLInputElement): string => {
            const type = (element.getAttribute("type") ?? "text").toLowerCase();

            if (type === "search") {
              return "searchbox";
            }
            if (type === "checkbox") {
              return "checkbox";
            }
            if (type === "radio") {
              return "radio";
            }
            if (["button", "submit", "reset"].includes(type)) {
              return "button";
            }

            return "textbox";
          };

          const readLabelledByText = (element: HTMLElement): string => {
            const labelledBy = element.getAttribute("aria-labelledby");
            if (!labelledBy) {
              return "";
            }

            return labelledBy
              .split(/\s+/)
              .map(
                (id) => document.getElementById(id)?.textContent?.trim() ?? "",
              )
              .filter(Boolean)
              .join(" ");
          };

          const readElementName = (element: HTMLElement): string => {
            const ariaLabel = element.getAttribute("aria-label")?.trim();
            if (ariaLabel) {
              return ariaLabel;
            }

            const labelledByText = readLabelledByText(element);
            if (labelledByText) {
              return labelledByText;
            }

            if ("labels" in element) {
              const labels = Array.from(
                (
                  element as
                    | HTMLInputElement
                    | HTMLSelectElement
                    | HTMLTextAreaElement
                ).labels ?? [],
              )
                .map((label) => label.textContent?.trim() ?? "")
                .filter(Boolean);
              if (labels.length > 0) {
                return labels.join(" ");
              }
            }

            const placeholder = element.getAttribute("placeholder")?.trim();
            if (placeholder) {
              return placeholder;
            }

            const title = element.getAttribute("title")?.trim();
            if (title) {
              return title;
            }

            if (element instanceof HTMLInputElement) {
              const value = element.value.trim();
              if (value) {
                return value;
              }
            }

            return (element.textContent ?? "").replace(/\s+/g, " ").trim();
          };

          const resolveRole = (element: HTMLElement): string => {
            const explicitRole = element
              .getAttribute("role")
              ?.trim()
              .toLowerCase();
            if (explicitRole) {
              return explicitRole;
            }

            if (element instanceof HTMLAnchorElement) {
              return "link";
            }
            if (element instanceof HTMLButtonElement) {
              return "button";
            }
            if (element instanceof HTMLSelectElement) {
              return "combobox";
            }
            if (element instanceof HTMLTextAreaElement) {
              return "textbox";
            }
            if (element instanceof HTMLInputElement) {
              return roleFromInputType(element);
            }
            if (element.isContentEditable) {
              return "textbox";
            }

            return "";
          };

          const isVisible = (element: HTMLElement): boolean => {
            if (
              element.hidden ||
              element.getAttribute("aria-hidden") === "true"
            ) {
              return false;
            }

            const style = window.getComputedStyle(element);
            if (
              style.display === "none" ||
              style.visibility === "hidden" ||
              Number(style.opacity) === 0 ||
              style.pointerEvents === "none"
            ) {
              return false;
            }

            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          };

          return Array.from(
            document.querySelectorAll<HTMLElement>(
              'a[href], button, input, select, textarea, [role], [contenteditable="true"]',
            ),
          )
            .filter(
              (element) =>
                !element.closest('[aria-hidden="true"], [hidden], template'),
            )
            .filter(isVisible)
            .map((element) => ({
              role: resolveRole(element),
              name: readElementName(element),
            }))
            .filter((element) => element.role && element.name);
        });

        const mergedElements = mergeInteractiveElementCandidates(
          ariaElements,
          domElements,
        );
        const prioritizedElements =
          prioritizeInteractiveElements(mergedElements);

        return {
          success: true,
          data: {
            elementCount: mergedElements.length,
            elements: prioritizedElements,
            hasMore: mergedElements.length > prioritizedElements.length,
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to get page elements",
        };
      }
    },
  },

  {
    name: "click",
    description: `Click an element by its role and name.

You get role, name, and index from get_interactive_elements().
Use this to click buttons, links, job listings, etc.

If multiple elements have the same role and name, use the index to disambiguate (0-based).

If the click fails, you'll get details about why so you can decide whether to retry, scroll first, or try a different element.`,
    parameters: {
      type: "object",
      properties: {
        role: {
          type: "string",
          description:
            "The accessibility role of the element (e.g., button, link)",
        },
        name: {
          type: "string",
          description: "The accessible name/text of the element",
        },
        index: {
          type: "number",
          description:
            "The occurrence index for disambiguating duplicates (0-based, optional)",
          default: 0,
        },
        retryIfNotVisible: {
          type: "boolean",
          description:
            "Whether to retry after scrolling if element is not visible (default: true)",
          default: true,
        },
      },
      required: ["role", "name"],
    },
    execute: async (args, context) => {
      // Validate args against schema
      const parseResult = ClickSchema.safeParse(args);
      if (!parseResult.success) {
        return {
          success: false,
          error: `Invalid click arguments: ${parseResult.error.issues.map((i) => i.message).join(", ")}`,
        };
      }
      const { role, name, index, retryIfNotVisible } = parseResult.data;

      const { page, state } = context;

      try {
        const locator = await resolveRoleLocator(page, role, name, index);

        // Check if element is visible
        const isVisible = await locator.isVisible().catch(() => false);

        if (!isVisible && retryIfNotVisible) {
          // Try scrolling to make it visible
          await locator.scrollIntoViewIfNeeded().catch(() => {});
          await page.waitForTimeout(500);
        }

        // Get element info before clicking
        const text = await locator.textContent().catch(() => null);

        await locator.click({ timeout: 10000 });
        await page.waitForTimeout(1000); // Brief wait for navigation/state change

        const newUrl = page.url();
        const navigated = newUrl !== state.currentUrl;

        if (navigated) {
          // Validate final URL after navigation
          const urlValidation = isAllowedUrl(
            newUrl,
            context.config.navigationPolicy,
          );
          if (!urlValidation.valid) {
            // Navigation went to disallowed URL - use recovery helper
            const recovery = await recoverFromOffAllowlist(
              page,
              newUrl,
              state.currentUrl,
              context.config.navigationPolicy,
            );
            if (recovery.recovered && recovery.recoveredUrl) {
              state.currentUrl = recovery.recoveredUrl;
            }
            return {
              success: false,
              error: recovery.error,
              data: {
                role,
                name: name.slice(0, 50),
                index,
                invalidUrl: newUrl,
                recovered: recovery.recovered,
              },
            };
          }

          state.currentUrl = newUrl;
          state.visitedUrls.add(newUrl);
        }

        return {
          success: true,
          data: {
            role,
            name: name.slice(0, 50),
            index,
            text: text?.slice(0, 100),
            navigated,
            newUrl: navigated ? newUrl : undefined,
          },
        };
      } catch (error) {
        // Check if we ended up on a disallowed URL and recover
        const currentUrl = page.url();
        if (currentUrl) {
          const urlCheck = isAllowedUrl(
            currentUrl,
            context.config.navigationPolicy,
          );
          if (!urlCheck.valid) {
            // Try to recover back to an allowed URL
            const recovery = await recoverFromOffAllowlist(
              page,
              currentUrl,
              state.currentUrl,
              context.config.navigationPolicy,
            );
            if (recovery.recovered && recovery.recoveredUrl) {
              state.currentUrl = recovery.recoveredUrl;
            }
          } else {
            // URL is allowed, update state
            state.currentUrl = currentUrl;
          }
        }

        return {
          success: false,
          error: error instanceof Error ? error.message : "Click failed",
          data: {
            role,
            name: name.slice(0, 50),
            index,
            errorType:
              error instanceof Error && error.message.includes("timeout")
                ? "timeout"
                : "click_failed",
          },
        };
      }
    },
  },

  {
    name: "fill",
    description: `Fill an input field with text by its role and label/name.

You get role, name, and index from get_interactive_elements().
Use this to fill search boxes, forms, etc.

If multiple elements have the same role and name, use the index to disambiguate (0-based).`,
    parameters: {
      type: "object",
      properties: {
        role: {
          type: "string",
          description:
            "The accessibility role of the input (e.g., textbox, searchbox)",
        },
        name: {
          type: "string",
          description: "The accessible name/label of the input field",
        },
        text: {
          type: "string",
          description: "The text to type into the field",
        },
        index: {
          type: "number",
          description:
            "The occurrence index for disambiguating duplicates (0-based, optional)",
          default: 0,
        },
        submit: {
          type: "boolean",
          description: "Whether to press Enter after filling (default: false)",
          default: false,
        },
      },
      required: ["role", "name", "text"],
    },
    execute: async (args, context) => {
      // Validate args against schema
      const parseResult = FillSchema.safeParse(args);
      if (!parseResult.success) {
        return {
          success: false,
          error: `Invalid fill arguments: ${parseResult.error.issues.map((i) => i.message).join(", ")}`,
        };
      }
      const { role, name, text, index, submit } = parseResult.data;

      const { page, state } = context;

      try {
        const locator = await resolveRoleLocator(page, role, name, index);

        await locator.fill(text);

        if (submit) {
          await locator.press("Enter");
          await page.waitForTimeout(1500);

          const newUrl = page.url();
          if (newUrl !== state.currentUrl) {
            // Validate final URL after navigation
            const urlValidation = isAllowedUrl(
              newUrl,
              context.config.navigationPolicy,
            );
            if (!urlValidation.valid) {
              // Navigation went to disallowed URL - use recovery helper
              const recovery = await recoverFromOffAllowlist(
                page,
                newUrl,
                state.currentUrl,
                context.config.navigationPolicy,
              );
              if (recovery.recovered && recovery.recoveredUrl) {
                state.currentUrl = recovery.recoveredUrl;
              }
              return {
                success: false,
                error: recovery.error,
                data: {
                  role,
                  name: name.slice(0, 30),
                  index,
                  text: text.slice(0, 50),
                  invalidUrl: newUrl,
                  recovered: recovery.recovered,
                },
              };
            }

            state.currentUrl = newUrl;
            state.visitedUrls.add(newUrl);
          }
        }

        return {
          success: true,
          data: {
            role,
            name: name.slice(0, 30),
            index,
            text: text.slice(0, 50),
            submitted: submit,
          },
        };
      } catch (error) {
        // Check if we ended up on a disallowed URL and recover
        const currentUrl = page.url();
        if (currentUrl) {
          const urlCheck = isAllowedUrl(
            currentUrl,
            context.config.navigationPolicy,
          );
          if (!urlCheck.valid) {
            // Try to recover back to an allowed URL
            const recovery = await recoverFromOffAllowlist(
              page,
              currentUrl,
              state.currentUrl,
              context.config.navigationPolicy,
            );
            if (recovery.recovered && recovery.recoveredUrl) {
              state.currentUrl = recovery.recoveredUrl;
            }
          } else {
            // URL is allowed, update state
            state.currentUrl = currentUrl;
          }
        }

        return {
          success: false,
          error: error instanceof Error ? error.message : "Fill failed",
          data: { role, name: name.slice(0, 30), index },
        };
      }
    },
  },

  {
    name: "select_option",
    description: `Select an option from a dropdown or combobox by its role and label/name.

Use this for visible city, industry, category, or work-mode filters on the page.
You get role, name, and index from get_interactive_elements().`,
    parameters: {
      type: "object",
      properties: {
        role: {
          type: "string",
          description:
            "The accessibility role of the control, usually combobox",
        },
        name: {
          type: "string",
          description: "The accessible name/label of the dropdown",
        },
        optionText: {
          type: "string",
          description: "Visible option text to select",
        },
        index: {
          type: "number",
          description:
            "The occurrence index for disambiguating duplicates (0-based, optional)",
          default: 0,
        },
        submit: {
          type: "boolean",
          description:
            "Whether to press Enter after selecting (default: false)",
          default: false,
        },
      },
      required: ["role", "name", "optionText"],
    },
    execute: async (args, context) => {
      const parseResult = SelectOptionSchema.safeParse(args);
      if (!parseResult.success) {
        return {
          success: false,
          error: `Invalid select_option arguments: ${parseResult.error.issues.map((issue) => issue.message).join(", ")}`,
        };
      }

      const { role, name, optionText, index, submit } = parseResult.data;
      const { page, state } = context;
      const previousUrl = state.currentUrl;

      try {
        const locator = await resolveRoleLocator(page, role, name, index);
        const elementHandle = await locator.elementHandle();

        if (!elementHandle) {
          return {
            success: false,
            error: "Dropdown element not found",
          };
        }

        const selectionResult = await elementHandle.evaluate(
          (element, targetOptionText) => {
            const normalizedTarget = targetOptionText.trim().toLowerCase();
            const matchOption = (text: string) =>
              text.trim().toLowerCase() === normalizedTarget;

            if (element instanceof HTMLSelectElement) {
              const option = Array.from(element.options).find(
                (candidate) =>
                  matchOption(candidate.textContent ?? "") ||
                  matchOption(candidate.label ?? ""),
              );

              if (!option) {
                return {
                  selected: false,
                  availableOptions: Array.from(element.options).map(
                    (candidate) => candidate.textContent?.trim() ?? "",
                  ),
                };
              }

              element.value = option.value;
              element.dispatchEvent(new Event("input", { bubbles: true }));
              element.dispatchEvent(new Event("change", { bubbles: true }));
              return {
                selected: true,
                selectedValue: option.value,
                selectedLabel: option.textContent?.trim() ?? option.label ?? "",
              };
            }

            return {
              selected: false,
              unsupportedTag: element.tagName.toLowerCase(),
            };
          },
          optionText,
        );

        if (!selectionResult?.selected) {
          return {
            success: false,
            error: selectionResult?.unsupportedTag
              ? `select_option supports native select elements only; received ${selectionResult.unsupportedTag}`
              : `Option "${optionText}" was not found`,
            data: selectionResult,
          };
        }

        if (submit) {
          await locator.press("Enter").catch(() => undefined);
          await page.waitForTimeout(1500);
        } else {
          await page.waitForTimeout(750);
        }

        const newUrl = page.url();
        const navigated = newUrl !== previousUrl;

        if (navigated) {
          const urlValidation = isAllowedUrl(
            newUrl,
            context.config.navigationPolicy,
          );
          if (!urlValidation.valid) {
            const recovery = await recoverFromOffAllowlist(
              page,
              newUrl,
              previousUrl,
              context.config.navigationPolicy,
            );
            if (recovery.recovered && recovery.recoveredUrl) {
              state.currentUrl = recovery.recoveredUrl;
            }
            return {
              success: false,
              error: recovery.error,
              data: {
                role,
                name: name.slice(0, 50),
                index,
                optionText: optionText.slice(0, 50),
                invalidUrl: newUrl,
                recovered: recovery.recovered,
              },
            };
          }

          state.currentUrl = newUrl;
          state.visitedUrls.add(newUrl);
        }

        return {
          success: true,
          data: {
            role,
            name: name.slice(0, 50),
            index,
            optionText: optionText.slice(0, 50),
            submitted: submit,
            navigated,
            newUrl: navigated ? newUrl : undefined,
            selectedLabel: selectionResult.selectedLabel ?? optionText,
            selectedValue: selectionResult.selectedValue ?? null,
          },
        };
      } catch (error) {
        const currentUrl = page.url();
        if (currentUrl) {
          const urlCheck = isAllowedUrl(
            currentUrl,
            context.config.navigationPolicy,
          );
          if (!urlCheck.valid) {
            const recovery = await recoverFromOffAllowlist(
              page,
              currentUrl,
              state.currentUrl,
              context.config.navigationPolicy,
            );
            if (recovery.recovered && recovery.recoveredUrl) {
              state.currentUrl = recovery.recoveredUrl;
            }
          } else {
            state.currentUrl = currentUrl;
          }
        }

        return {
          success: false,
          error:
            error instanceof Error ? error.message : "Select option failed",
          data: {
            role,
            name: name.slice(0, 50),
            index,
            optionText: optionText.slice(0, 50),
          },
        };
      }
    },
  },

  {
    name: "scroll_down",
    description: `Scroll down the page to load more content.
    
Use this when you see "load more" buttons or when you need to see more job listings.
Returns information about whether new content was loaded so you can decide whether to continue scrolling.`,
    parameters: {
      type: "object",
      properties: {
        amount: {
          type: "number",
          description:
            "Pixels to scroll (default: 800, which is about one screen)",
          default: 800,
        },
      },
    },
    execute: async (args, context) => {
      // Validate args against schema
      const parseResult = ScrollDownSchema.safeParse(args);
      if (!parseResult.success) {
        return {
          success: false,
          error: `Invalid scroll_down arguments: ${parseResult.error.issues.map((i) => i.message).join(", ")}`,
        };
      }
      const { amount } = parseResult.data;

      const { page } = context;

      try {
        // Get current scroll position and page height
        const beforeInfo = await page.evaluate(() => ({
          scrollY: window.scrollY,
          scrollHeight: document.body.scrollHeight,
          clientHeight: window.innerHeight,
        }));

        // Scroll
        await page.evaluate(
          (scrollAmount) => window.scrollBy(0, scrollAmount),
          amount,
        );
        await page.waitForTimeout(1000); // Wait for lazy loading

        // Get new scroll position
        const afterInfo = await page.evaluate(() => ({
          scrollY: window.scrollY,
          scrollHeight: document.body.scrollHeight,
          clientHeight: window.innerHeight,
        }));

        const scrolledToBottom =
          afterInfo.scrollY + afterInfo.clientHeight >=
          afterInfo.scrollHeight - 100;
        const newContentLoaded =
          afterInfo.scrollHeight > beforeInfo.scrollHeight;

        return {
          success: true,
          data: {
            scrolledPixels: amount,
            newScrollY: afterInfo.scrollY,
            totalHeight: afterInfo.scrollHeight,
            scrolledToBottom,
            newContentLoaded,
            canScrollMore: !scrolledToBottom,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Scroll failed",
        };
      }
    },
  },

  {
    name: "scroll_to_top",
    description: `Scroll back to the top of the current page.

Use this when search boxes, filters, or header controls may be above the current scroll position and need to be re-checked.`,
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async (args, context) => {
      const parseResult = ScrollToTopSchema.safeParse(args);
      if (!parseResult.success) {
        return {
          success: false,
          error: `Invalid scroll_to_top arguments: ${parseResult.error.issues.map((i) => i.message).join(", ")}`,
        };
      }

      const { page } = context;

      try {
        const beforeInfo = await page.evaluate(() => ({
          scrollY: window.scrollY,
          scrollHeight: document.body.scrollHeight,
          clientHeight: window.innerHeight,
        }));

        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(800);

        const afterInfo = await page.evaluate(() => ({
          scrollY: window.scrollY,
          scrollHeight: document.body.scrollHeight,
          clientHeight: window.innerHeight,
        }));

        return {
          success: true,
          data: {
            previousScrollY: beforeInfo.scrollY,
            newScrollY: afterInfo.scrollY,
            totalHeight: afterInfo.scrollHeight,
            returnedToTop: afterInfo.scrollY <= 10,
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : "Scroll to top failed",
        };
      }
    },
  },

  {
    name: "go_back",
    description: `Navigate back to the previous page.
    
Use this after viewing a job detail to return to search results.`,
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async (_args, context) => {
      const { page, state } = context;

      try {
        const previousUrl = state.currentUrl;

        await page.goBack({ waitUntil: "domcontentloaded", timeout: 10000 });
        await page.waitForTimeout(1000);

        const newUrl = page.url();
        const urlChanged = previousUrl !== newUrl;

        // Only update state if URL actually changed and is allowed
        if (urlChanged) {
          const urlValidation = isAllowedUrl(
            newUrl,
            context.config.navigationPolicy,
          );
          if (!urlValidation.valid) {
            // Back navigation went off-allowlist - use recovery helper
            const recovery = await recoverFromOffAllowlist(
              page,
              newUrl,
              previousUrl,
              context.config.navigationPolicy,
            );
            if (recovery.recovered && recovery.recoveredUrl) {
              state.currentUrl = recovery.recoveredUrl;
            }
            return {
              success: false,
              error: recovery.error,
              data: {
                wentBack: false,
                previousUrl,
                invalidUrl: newUrl,
                recovered: recovery.recovered,
              },
            };
          }
          state.currentUrl = newUrl;
        }

        return {
          success: true,
          data: {
            wentBack: urlChanged,
            previousUrl,
            currentUrl: newUrl,
          },
        };
      } catch (error) {
        // Check if we ended up on a disallowed URL and recover
        const currentUrl = page.url();
        if (currentUrl) {
          const urlCheck = isAllowedUrl(
            currentUrl,
            context.config.navigationPolicy,
          );
          if (!urlCheck.valid) {
            // Try to recover back to an allowed URL
            const recovery = await recoverFromOffAllowlist(
              page,
              currentUrl,
              state.currentUrl,
              context.config.navigationPolicy,
            );
            if (recovery.recovered && recovery.recoveredUrl) {
              state.currentUrl = recovery.recoveredUrl;
            }
          } else {
            // URL is allowed, update state
            state.currentUrl = currentUrl;
          }
        }

        return {
          success: false,
          error: error instanceof Error ? error.message : "Go back failed",
        };
      }
    },
  },

  {
    name: "extract_jobs",
    description: `Extract job postings from the current page.
    
This analyzes the page content and extracts structured job data including titles, companies, locations, and descriptions.

Use this when you're on:
- Job search results pages
- Company job listing pages
- Individual job detail pages

Returns the extracted jobs and advises whether you should scroll for more or navigate to see details.`,
    parameters: {
      type: "object",
      properties: {
        pageType: {
          type: "string",
          enum: ["search_results", "job_detail", "company_page", "unknown"],
          description: "What type of page you think this is",
        },
        maxJobs: {
          type: "number",
          description: "Maximum jobs to extract from this page (default: 5)",
          default: 5,
        },
      },
      required: ["pageType"],
    },
    execute: async (args, context) => {
      // Validate args against schema
      const parseResult = ExtractJobsSchema.safeParse(args);
      if (!parseResult.success) {
        return {
          success: false,
          error: `Invalid extract_jobs arguments: ${parseResult.error.issues.map((i) => i.message).join(", ")}`,
        };
      }
      const { pageType, maxJobs } = parseResult.data;

      const { page } = context;

      try {
        // Get page content
        const pageText = await page.locator("body").innerText();
        const pageUrl = page.url();
        const pageTextLength = pageText.length;

        const relevantUrlSubstrings =
          context.config.extractionContext?.relevantUrlSubstrings ?? [];
        const discoveredUrls = await page.evaluate(
          (input: {
            allowedHostnames: string[];
            relevantUrlSubstrings: string[];
            allowSubdomains: boolean;
          }) => {
            const urls = new Set<string>();
            for (const anchor of Array.from(
              document.querySelectorAll("a[href]"),
            )) {
              const href = anchor.getAttribute("href");
              if (!href) continue;
              try {
                const absoluteUrl = new URL(
                  href,
                  window.location.href,
                ).toString();
                const parsedUrl = new URL(absoluteUrl);
                const hostname = parsedUrl.hostname.toLowerCase();
                const hostAllowed = input.allowedHostnames.some(
                  (allowedHostname) =>
                    hostname === allowedHostname ||
                    (input.allowSubdomains &&
                      hostname.endsWith(`.${allowedHostname}`)),
                );
                if (!hostAllowed) {
                  continue;
                }

                const haystack =
                  `${parsedUrl.pathname}${parsedUrl.search}`.toLowerCase();
                const matchesRelevantUrl =
                  input.relevantUrlSubstrings.length === 0 ||
                  input.relevantUrlSubstrings.some((substring) =>
                    haystack.includes(substring.toLowerCase()),
                  );

                if (matchesRelevantUrl) {
                  urls.add(absoluteUrl);
                }
              } catch {
                // Ignore invalid href values.
              }
            }
            return Array.from(urls).slice(0, 30);
          },
          {
            allowedHostnames:
              context.config.navigationPolicy.allowedHostnames.map((hostname) =>
                hostname.toLowerCase(),
              ),
            relevantUrlSubstrings,
            allowSubdomains:
              context.config.navigationPolicy.allowSubdomains === true,
          },
        );

        const MAX_PAGE_TEXT_CHARS = 8000;
        const urlAppendix =
          discoveredUrls.length > 0
            ? `\n\nRelevant in-scope URLs found on page:\n${discoveredUrls.map((url) => `- ${url}`).join("\n")}`
            : "";
        const truncationNotice = "\n... [content truncated]";
        const pageTextBudget = Math.max(
          0,
          MAX_PAGE_TEXT_CHARS - urlAppendix.length,
        );
        const pageTextTruncated =
          pageText.length + urlAppendix.length > MAX_PAGE_TEXT_CHARS;
        const truncatedPageText = pageTextTruncated
          ? `${pageText.slice(0, Math.max(0, pageTextBudget - truncationNotice.length))}${truncationNotice}${urlAppendix}`
          : `${pageText}${urlAppendix}`;
        const extractionTextLength = pageText.length + urlAppendix.length;

        // Heuristics to determine if page is ready for extraction
        const hasMinimumContent = pageTextLength > 500;

        // Check for genuine loading indicators (not false positives like "Loading dock technician")
        // Use word boundaries and ellipses to detect real loading UIs
        // Use multiline flag (^$) to match per-line in multi-line text
        const loadingPatterns = [
          /loading\.\.\./i,
          /loading\s*$/im, // "Loading" at end of line (per-line)
          /^loading$/im, // Just "Loading" alone on a line (per-line)
          /please wait/i,
          /please wait\.\.\./i,
          /spinner/i, // Spinner is almost always a loading indicator
          /fetching/i,
          /retrieving/i,
        ];
        const hasNoLoadingIndicators = !loadingPatterns.some((pattern) =>
          pattern.test(pageText),
        );

        // Check for job-related content based on page type
        const lowerText = pageText.toLowerCase();
        let hasJobContent = false;

        if (pageType === "search_results") {
          // Look for job-related keywords across common multilingual listing pages.
          hasJobContent = [
            "job",
            "jobs",
            "position",
            "positions",
            "apply",
            "career",
            "careers",
            "opening",
            "openings",
            "vacancy",
            "vacancies",
            "role",
            "roles",
            "konkurs",
            "pune",
            "punes",
            "punesim",
            "punetor",
            "pozit",
            "pozita",
            "pozite",
            "karriere",
            "karrier",
            "apliko",
            "aplikim",
            "vende te lira",
            "vende pune",
          ].some((keyword) => lowerText.includes(keyword));
        } else if (pageType === "job_detail" || pageType === "company_page") {
          // Job detail pages and company pages should have description, requirements, or job listings.
          hasJobContent = [
            "description",
            "requirements",
            "qualifications",
            "responsibilities",
            "career",
            "careers",
            "openings",
            "hiring",
            "job",
            "position",
            "apply",
            "pershkrim",
            "detyr",
            "kualifik",
            "kerkes",
            "kerkesa",
            "pergjegjes",
            "pergjegjesi",
            "apliko",
            "konkurs",
            "pune",
            "pozit",
            "karriere",
            "orari",
          ].some((keyword) => lowerText.includes(keyword));
        } else {
          // For unknown types, require substantial content
          hasJobContent = pageTextLength > 1000;
        }

        const readyForExtraction =
          hasMinimumContent && hasNoLoadingIndicators && hasJobContent;

        return {
          success: true,
          data: {
            pageType,
            pageUrl,
            pageText: truncatedPageText,
            pageTextLength: extractionTextLength,
            pageTextTruncated,
            readyForExtraction,
            maxJobs,
            linkedInJobUrlsFound: discoveredUrls.length,
            checks: {
              hasMinimumContent,
              hasNoLoadingIndicators,
              hasJobContent,
            },
          },
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : "Failed to extract jobs",
        };
      }
    },
  },

  {
    name: "finish",
    description: `Finish the current task and return any discovered jobs plus structured site findings.

Call this when the phase goal has been proven, safely blocked, or you have exhausted the useful evidence on the page.`,
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description:
            'Why you are finishing (e.g., "Found 20 jobs", "No more results", "Reached max steps")',
        },
        summary: {
          type: "string",
          description:
            "One concise site-specific summary of what was proven in this phase.",
        },
        reliableControls: {
          type: "array",
          items: { type: "string" },
          description:
            "Reliable controls, entrypoints, or search actions that worked on this site.",
        },
        trickyFilters: {
          type: "array",
          items: { type: "string" },
          description:
            "Tricky, hidden, misleading, or unreliable filters and controls to remember.",
        },
        navigationTips: {
          type: "array",
          items: { type: "string" },
          description:
            "Concrete navigation guidance such as route patterns, job card behavior, or detail-page rules.",
        },
        applyTips: {
          type: "array",
          items: { type: "string" },
          description:
            "Safe apply-entry observations such as inline apply, external apply, or no reliable apply path.",
        },
        warnings: {
          type: "array",
          items: { type: "string" },
          description:
            "Site-specific blockers, caveats, or uncertainty that later runs should respect.",
        },
      },
      required: ["reason"],
    },
    execute: async (args) => {
      // Validate args against schema
      const parseResult = FinishSchema.safeParse(args);
      if (!parseResult.success) {
        return {
          success: false,
          error: `Invalid finish arguments: ${parseResult.error.issues.map((i) => i.message).join(", ")}`,
        };
      }
      const {
        reason,
        summary,
        reliableControls,
        trickyFilters,
        navigationTips,
        applyTips,
        warnings,
      } = parseResult.data;

      return {
        success: true,
        data: {
          finished: true,
          reason,
          debugFindings: {
            summary: summary ?? null,
            reliableControls,
            trickyFilters,
            navigationTips,
            applyTips,
            warnings,
          },
        },
      };
    },
  },
];

export function getToolDefinitions() {
  return browserTools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export function getToolExecutor(name: string) {
  return browserTools.find((tool) => tool.name === name);
}
