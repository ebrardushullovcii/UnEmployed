import { isAllowedUrl } from "../allowlist";
import type { ToolDefinition } from "../types";
import type { Locator, Page } from "playwright";
import {
  buildComboboxOptionScopes,
  clickMatchingComboboxOption,
  ClickSchema,
  fillComboboxValue,
  FillSchema,
  mergeInteractiveElementCandidates,
  parseInteractiveElementsFromAriaSnapshot,
  prioritizeInteractiveElements,
  readComboboxSelection,
  recoverFromOffAllowlist,
  resolveRoleLocator,
  SelectOptionSchema,
} from "./shared";

const CLICK_TIMEOUT_MS = 5000;
const REPEATED_FAILURE_BLOCK_THRESHOLD = 2;

async function readInteractionPageStateToken(page: Page): Promise<string> {
  try {
    return await page.evaluate(() => {
      const elements = Array.from(
        document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [role="button"], [role="link"], [role="textbox"], [role="checkbox"], [role="menuitem"], [role="option"], [role="tab"], [role="switch"], [role="slider"], [role="combobox"], [contenteditable="true"]'),
      )
        .filter((element) => !element.closest('[aria-hidden="true"], [hidden], template'))
        .slice(0, 80)
        .map((element) => {
          const role = element.getAttribute('role')?.trim().toLowerCase() ?? element.tagName.toLowerCase()
          const name = [
            element.getAttribute('aria-label'),
            element.getAttribute('placeholder'),
            element.getAttribute('title'),
            element.textContent,
          ].find((value) => typeof value === 'string' && value.trim().length > 0) ?? ''

          let state = ''
          if (element instanceof HTMLInputElement) {
            if (element.type === 'checkbox' || element.type === 'radio') {
              state = element.checked ? '[checked]' : '[unchecked]'
            } else {
              state = `[value:${element.value.slice(0, 50)}]`
            }
          } else if (element instanceof HTMLTextAreaElement) {
            state = `[value:${element.value.slice(0, 50)}]`
          } else if (element instanceof HTMLSelectElement) {
            const selectedOption = element.options[element.selectedIndex]
            state = `[selected:${selectedOption?.text?.slice(0, 30) ?? selectedOption?.value?.slice(0, 30) ?? ''}]`
          }

          return `${role}:${name.replace(/\s+/g, ' ').trim()}${state}`
        })

      return `${window.location.href}::${document.title}::${elements.join('|')}`;
    });
  } catch {
    return page.url();
  }
}

async function syncFailedInteractionAttemptsWithPageState(
  page: Page,
  state: {
    failedInteractionAttempts?: Map<string, { count: number; lastError: string }>;
    failedInteractionPageStateToken?: string;
  },
): Promise<void> {
  const nextToken = await readInteractionPageStateToken(page);

  if (
    state.failedInteractionAttempts &&
    state.failedInteractionPageStateToken &&
    state.failedInteractionPageStateToken !== nextToken
  ) {
    state.failedInteractionAttempts.clear();
  }

  state.failedInteractionPageStateToken = nextToken;
}

function clearFailedInteractionAttemptsAfterNavigation(state: {
  failedInteractionAttempts?: Map<string, { count: number; lastError: string }>;
  failedInteractionPageStateToken?: string;
}) {
  state.failedInteractionAttempts?.clear();
  delete state.failedInteractionPageStateToken;
}

function normalizeInteractionAttemptRole(kind: "click" | "fill" | "select_option", role: string): string {
  void kind;
  return role.trim().toLowerCase();
}

function normalizeInteractionAttemptName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\bverified job\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

function buildInteractionAttemptKey(
  kind: "click" | "fill" | "select_option",
  role: string,
  name: string,
  index: number,
): string {
  return `${kind}::${normalizeInteractionAttemptRole(kind, role)}::${normalizeInteractionAttemptName(name)}::${index}`;
}

function shouldTreatAsRepeatedClickFailure(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  return (
    normalized.includes("no ") && normalized.includes(" matched accessible name")
  ) || normalized.includes("intercepts pointer events") || normalized.includes("intercepts direct pointer clicks") || normalized.includes("disallowed url");
}

function shouldTreatAsRepeatedFillFailure(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  return (
    (normalized.includes("no ") && normalized.includes(" matched accessible name")) ||
    normalized.includes("timeout") ||
    normalized.includes("did not receive focus") ||
    normalized.includes("disallowed url")
  );
}

function summarizeClickFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/intercepts pointer events/i.test(message)) {
    return "The matched control is present, but another visible element intercepts direct pointer clicks.";
  }

  if (/No .* matched accessible name/i.test(message)) {
    return message;
  }

  return message;
}

function recordFailedInteractionAttempt(
  state: { failedInteractionAttempts?: Map<string, { count: number; lastError: string }> },
  interactionAttemptKey: string,
  priorAttempt: { count: number; lastError: string } | undefined,
  errorMessage: string,
) {
  const nextFailureCount = (priorAttempt?.count ?? 0) + 1;
  state.failedInteractionAttempts?.set(interactionAttemptKey, {
    count: nextFailureCount,
    lastError: errorMessage,
  });
  return nextFailureCount;
}

async function clickCheckboxWithLabelFallback(locator: Locator): Promise<boolean> {
  const inputId = await locator.getAttribute("id").catch(() => null);
  const labelForSelector = inputId ? `label[for="${inputId.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]` : null;
  const explicitLabel = labelForSelector ? locator.page().locator(labelForSelector).first() : null;
  const wrappingLabel = locator.locator("xpath=ancestor::label[1]").first();

  const tryLabel = async (labelLocator: Locator) => {
    const labelCount = await labelLocator.count().catch(() => 0);
    if (labelCount === 0) {
      return false;
    }

    const visible = await labelLocator.isVisible().catch(() => false);
    if (!visible) {
      return false;
    }

    await labelLocator.scrollIntoViewIfNeeded().catch(() => {});
    await labelLocator.click({ timeout: CLICK_TIMEOUT_MS / 2 });
    return true;
  };

  if (explicitLabel && await tryLabel(explicitLabel).catch(() => false)) {
    return true;
  }

  return await tryLabel(wrappingLabel).catch(() => false);
}

function normalizeOptionText(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

function comboboxSelectionMatchesOption(
  selection: { selectedLabel: string | null; selectedValue: string | null },
  optionText: string,
): boolean {
  const normalizedOptionText = normalizeOptionText(optionText);

  if (!normalizedOptionText) {
    return false;
  }

  return [selection.selectedLabel, selection.selectedValue].some(
    (value) => normalizeOptionText(value) === normalizedOptionText,
  );
}

export const interactionTools: ToolDefinition[] = [
  {
    name: "get_interactive_elements",
    retryable: true,
    description: `Get a list of interactive elements on the page with their accessibility role, name, and occurrence index.

Use this to understand what's clickable, fillable, or scrollable on the page.
Returns elements with role, name, and index that you can use with click(role, name, index) or fill(role, name, index) tools.

Example: { role: 'button', name: 'Apply', index: 0 } can be clicked with click('button', 'Apply', 0)

Note: If multiple elements have the same role and name, use the index (0-based) to disambiguate which one to interact with.`,
    parameters: { type: "object", properties: {} },
    execute: async (_args, context) => {
      const { page } = context;

      try {
        const snapshot = await page.locator("body").ariaSnapshot().catch(() => "");
        const ariaElements = snapshot ? parseInteractiveElementsFromAriaSnapshot(snapshot) : [];
        const domElements = await page.evaluate(() => {
          const roleFromInputType = (element: HTMLInputElement): string => {
            const type = (element.getAttribute("type") ?? "text").toLowerCase();
            if (type === "search") return "searchbox";
            if (type === "checkbox") return "checkbox";
            if (type === "radio") return "radio";
            if (["button", "submit", "reset"].includes(type)) return "button";
            return "textbox";
          };

          const readLabelledByText = (element: HTMLElement): string => {
            const labelledBy = element.getAttribute("aria-labelledby");
            if (!labelledBy) return "";
            return labelledBy
              .split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
              .filter(Boolean)
              .join(" ");
          };

          const readElementName = (element: HTMLElement): string => {
            const ariaLabel = element.getAttribute("aria-label")?.trim();
            if (ariaLabel) return ariaLabel;
            const labelledByText = readLabelledByText(element);
            if (labelledByText) return labelledByText;
            if ("labels" in element) {
              const labels = Array.from((element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).labels ?? [])
                .map((label) => label.textContent?.trim() ?? "")
                .filter(Boolean);
              if (labels.length > 0) return labels.join(" ");
            }
            const placeholder = element.getAttribute("placeholder")?.trim();
            if (placeholder) return placeholder;
            const title = element.getAttribute("title")?.trim();
            if (title) return title;
            if (element instanceof HTMLInputElement) {
              const value = element.value.trim();
              if (value) return value;
            }
            return (element.textContent ?? "").replace(/\s+/g, " ").trim();
          };

          const resolveRole = (element: HTMLElement): string => {
            const explicitRole = element.getAttribute("role")?.trim().toLowerCase();
            if (explicitRole) return explicitRole;
            if (element instanceof HTMLAnchorElement) return "link";
            if (element instanceof HTMLButtonElement) return "button";
            if (element instanceof HTMLSelectElement) return "combobox";
            if (element instanceof HTMLTextAreaElement) return "textbox";
            if (element instanceof HTMLInputElement) return roleFromInputType(element);
            if (element.isContentEditable) return "textbox";
            return "";
          };

          const isVisible = (element: HTMLElement): boolean => {
            if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
            const style = window.getComputedStyle(element);
            if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0 || style.pointerEvents === "none") return false;
            const rect = element.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          };

          return Array.from(document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [role], [contenteditable="true"]'))
            .filter((element) => !element.closest('[aria-hidden="true"], [hidden], template'))
            .filter(isVisible)
            .map((element) => ({ role: resolveRole(element), name: readElementName(element) }))
            .filter((element) => element.role && element.name);
        });

        const mergedElements = mergeInteractiveElementCandidates(ariaElements, domElements);
        const prioritizedElements = prioritizeInteractiveElements(mergedElements);

        return { success: true, data: { elementCount: mergedElements.length, elements: prioritizedElements, hasMore: mergedElements.length > prioritizedElements.length } };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to get page elements" };
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
        role: { type: "string", description: "The accessibility role of the element (e.g., button, link)" },
        name: { type: "string", description: "The accessible name/text of the element" },
        index: { type: "number", description: "The occurrence index for disambiguating duplicates (0-based, optional)", default: 0 },
        retryIfNotVisible: { type: "boolean", description: "Whether to retry after scrolling if element is not visible (default: true)", default: true },
      },
      required: ["role", "name"],
    },
    execute: async (args, context) => {
      const parseResult = ClickSchema.safeParse(args);
      if (!parseResult.success) return { success: false, error: `Invalid click arguments: ${parseResult.error.issues.map((i) => i.message).join(", ")}` };
      const { role, name, index, retryIfNotVisible } = parseResult.data;
      const { page, state } = context;
      await syncFailedInteractionAttemptsWithPageState(page, state);
      const interactionAttemptKey = buildInteractionAttemptKey("click", role, name, index);
      const priorAttempt = state.failedInteractionAttempts?.get(interactionAttemptKey);

      if (
        priorAttempt &&
        priorAttempt.count >= REPEATED_FAILURE_BLOCK_THRESHOLD &&
        shouldTreatAsRepeatedClickFailure(priorAttempt.lastError)
      ) {
        return {
          success: false,
          error: `Skipping repeated click attempt for ${role} "${name}" after ${priorAttempt.count} similar failures: ${priorAttempt.lastError}`,
          data: {
            role,
            name: name.slice(0, 50),
            index,
            errorType: "repeated_click_blocked",
          },
        };
      }

      try {
        const locator = await resolveRoleLocator(page, role, name, index);
        const isVisible = await locator.isVisible().catch(() => false);
        if (!isVisible && retryIfNotVisible) {
          await locator.scrollIntoViewIfNeeded().catch(() => {});
          await page.waitForTimeout(500);
        }
        const visibleAfterScroll = await locator.isVisible().catch(() => false);

        if (!visibleAfterScroll && role === 'link') {
          const href = await locator.getAttribute('href').catch(() => null)

          if (href) {
            const previousUrl = state.currentUrl || page.url()
            const absoluteUrl = new URL(href, previousUrl).toString()
            const urlValidation = isAllowedUrl(absoluteUrl, context.config.navigationPolicy)

            if (!urlValidation.valid) {
              const repeatedFailureCount = recordFailedInteractionAttempt(
                state,
                interactionAttemptKey,
                priorAttempt,
                urlValidation.error ?? 'Navigation went to disallowed URL.',
              )

              return {
                success: false,
                error: urlValidation.error,
                data: {
                  role,
                  name: name.slice(0, 50),
                  index,
                  invalidUrl: absoluteUrl,
                  recovered: false,
                  navigationMethod: 'href_fallback',
                  errorType: 'not_allowed_by_navigation_policy',
                  repeatedFailureCount,
                },
              }
            }

            await page.goto(absoluteUrl, { waitUntil: 'domcontentloaded', timeout: CLICK_TIMEOUT_MS })
            const newUrl = page.url()
            const finalUrlValidation = isAllowedUrl(newUrl, context.config.navigationPolicy)

            if (!finalUrlValidation.valid) {
              const recovery = await recoverFromOffAllowlist(
                page,
                newUrl,
                previousUrl,
                context.config.navigationPolicy,
              )
              const repeatedFailureCount = recordFailedInteractionAttempt(
                state,
                interactionAttemptKey,
                priorAttempt,
                recovery.error,
              )
              if (recovery.recovered && recovery.recoveredUrl) {
                state.currentUrl = recovery.recoveredUrl
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
                  navigationMethod: 'href_fallback',
                  errorType: 'click_failed',
                  repeatedFailureCount,
                },
              }
            }

            clearFailedInteractionAttemptsAfterNavigation(state)
            state.currentUrl = newUrl
            state.visitedUrls.add(newUrl)

            return {
              success: true,
              data: {
                role,
                name: name.slice(0, 50),
                index,
                text: await locator.textContent().catch(() => null),
                navigated: true,
                newUrl,
                navigationMethod: 'href_fallback'
              }
            }
          }
        }

        const text = await locator.textContent().catch(() => null);
        try {
          await locator.click({ timeout: CLICK_TIMEOUT_MS });
        } catch (clickError) {
          const canUseCheckboxLabelFallback =
            role === "checkbox" && /intercepts pointer events/i.test(clickError instanceof Error ? clickError.message : String(clickError));

          if (!canUseCheckboxLabelFallback || !(await clickCheckboxWithLabelFallback(locator).catch(() => false))) {
            throw clickError;
          }
        }
        await page.waitForTimeout(1000);

        const newUrl = page.url();
        const navigated = newUrl !== state.currentUrl;

        if (navigated) {
          const urlValidation = isAllowedUrl(newUrl, context.config.navigationPolicy);
          if (!urlValidation.valid) {
            const recovery = await recoverFromOffAllowlist(page, newUrl, state.currentUrl, context.config.navigationPolicy);
            const repeatedFailureCount = recordFailedInteractionAttempt(
              state,
              interactionAttemptKey,
              priorAttempt,
              recovery.error,
            );
            if (recovery.recovered && recovery.recoveredUrl) state.currentUrl = recovery.recoveredUrl;
            return { success: false, error: recovery.error, data: { role, name: name.slice(0, 50), index, invalidUrl: newUrl, recovered: recovery.recovered, errorType: 'click_failed', repeatedFailureCount } };
          }
          clearFailedInteractionAttemptsAfterNavigation(state);
          state.currentUrl = newUrl;
          state.visitedUrls.add(newUrl);
        } else {
          state.failedInteractionAttempts?.delete(interactionAttemptKey);
        }

        return { success: true, data: { role, name: name.slice(0, 50), index, text: text?.slice(0, 100), navigated, newUrl: navigated ? newUrl : undefined } };
      } catch (error) {
        const summarizedError = summarizeClickFailure(error);
        const nextFailureCount = recordFailedInteractionAttempt(
          state,
          interactionAttemptKey,
          priorAttempt,
          summarizedError,
        );

        const currentUrl = page.url();
        if (currentUrl) {
          const urlCheck = isAllowedUrl(currentUrl, context.config.navigationPolicy);
          if (!urlCheck.valid) {
            const recovery = await recoverFromOffAllowlist(page, currentUrl, state.currentUrl, context.config.navigationPolicy);
            if (recovery.recovered && recovery.recoveredUrl) state.currentUrl = recovery.recoveredUrl;
          } else {
            state.currentUrl = currentUrl;
          }
        }

        return {
          success: false,
          error: summarizedError,
          data: {
            role,
            name: name.slice(0, 50),
            index,
            errorType: /timeout/i.test(summarizedError) ? "timeout" : "click_failed",
            repeatedFailureCount: nextFailureCount,
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
        role: { type: "string", description: "The accessibility role of the input (e.g., textbox, searchbox)" },
        name: { type: "string", description: "The accessible name/label of the input field" },
        text: { type: "string", description: "The text to type into the field" },
        index: { type: "number", description: "The occurrence index for disambiguating duplicates (0-based, optional)", default: 0 },
        submit: { type: "boolean", description: "Whether to press Enter after filling (default: false)", default: false },
      },
      required: ["role", "name", "text"],
    },
    execute: async (args, context) => {
      const parseResult = FillSchema.safeParse(args);
      if (!parseResult.success) return { success: false, error: `Invalid fill arguments: ${parseResult.error.issues.map((i) => i.message).join(", ")}` };
      const { role, name, text, index, submit } = parseResult.data;
      const { page, state } = context;
      await syncFailedInteractionAttemptsWithPageState(page, state);
      const interactionAttemptKey = buildInteractionAttemptKey("fill", role, name, index);
      const priorAttempt = state.failedInteractionAttempts?.get(interactionAttemptKey);

      if (
        priorAttempt &&
        priorAttempt.count >= REPEATED_FAILURE_BLOCK_THRESHOLD &&
        shouldTreatAsRepeatedFillFailure(priorAttempt.lastError)
      ) {
        return {
          success: false,
          error: `Skipping repeated fill attempt for ${role} "${name}" after ${priorAttempt.count} similar failures: ${priorAttempt.lastError}`,
          data: {
            role,
            name: name.slice(0, 30),
            index,
            errorType: "repeated_fill_blocked",
          },
        };
      }

      try {
        const locator = await resolveRoleLocator(page, role, name, index);
        await locator.fill(text);
        if (submit) {
          await locator.press("Enter");
          await page.waitForTimeout(1500);
          const newUrl = page.url();
          if (newUrl !== state.currentUrl) {
            const urlValidation = isAllowedUrl(newUrl, context.config.navigationPolicy);
            if (!urlValidation.valid) {
              const recovery = await recoverFromOffAllowlist(page, newUrl, state.currentUrl, context.config.navigationPolicy);
              const repeatedFailureCount = recordFailedInteractionAttempt(
                state,
                interactionAttemptKey,
                priorAttempt,
                recovery.error,
              );
              if (recovery.recovered && recovery.recoveredUrl) state.currentUrl = recovery.recoveredUrl;
              return { success: false, error: recovery.error, data: { role, name: name.slice(0, 30), index, invalidUrl: newUrl, recovered: recovery.recovered, errorType: 'fill_failed', repeatedFailureCount } };
            }
            clearFailedInteractionAttemptsAfterNavigation(state);
            state.currentUrl = newUrl;
            state.visitedUrls.add(newUrl);
          } else {
            state.failedInteractionAttempts?.delete(interactionAttemptKey);
          }
        } else {
          state.failedInteractionAttempts?.delete(interactionAttemptKey);
        }

        return { success: true, data: { role, name: name.slice(0, 30), index, submitted: submit } };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Fill failed";
        const nextFailureCount = recordFailedInteractionAttempt(state, interactionAttemptKey, priorAttempt, errorMessage);

        const currentUrl = page.url();
        if (currentUrl) {
          const urlCheck = isAllowedUrl(currentUrl, context.config.navigationPolicy);
          if (!urlCheck.valid) {
            const recovery = await recoverFromOffAllowlist(page, currentUrl, state.currentUrl, context.config.navigationPolicy);
            if (recovery.recovered && recovery.recoveredUrl) state.currentUrl = recovery.recoveredUrl;
          } else {
            state.currentUrl = currentUrl;
          }
        }

        return {
          success: false,
          error: errorMessage,
          data: {
            role,
            name: name.slice(0, 30),
            index,
            errorType: /timeout/i.test(errorMessage) ? "timeout" : "fill_failed",
            repeatedFailureCount: nextFailureCount,
          },
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
        role: { type: "string", description: "The accessibility role of the control, usually combobox" },
        name: { type: "string", description: "The accessible name/label of the dropdown" },
        optionText: { type: "string", description: "Visible option text to select" },
        index: { type: "number", description: "The occurrence index for disambiguating duplicates (0-based, optional)", default: 0 },
        submit: { type: "boolean", description: "Whether to press Enter after selecting (default: false)", default: false },
      },
      required: ["role", "name", "optionText"],
    },
    execute: async (args, context) => {
      const parseResult = SelectOptionSchema.safeParse(args);
      if (!parseResult.success) return { success: false, error: `Invalid select_option arguments: ${parseResult.error.issues.map((issue) => issue.message).join(", ")}` };

      const { role, name, optionText, index, submit } = parseResult.data;
      const { page, state } = context;
      const previousUrl = state.currentUrl;
      await syncFailedInteractionAttemptsWithPageState(page, state);

      try {
        const locator = await resolveRoleLocator(page, role, name, index);
        const elementHandle = await locator.elementHandle();
        if (!elementHandle) return { success: false, error: "Dropdown element not found" };

        const selectionResult = await elementHandle.evaluate((element, targetOptionText) => {
          const normalizedTarget = targetOptionText.trim().toLowerCase();
          const matchOption = (text: string) => text.trim().toLowerCase() === normalizedTarget;

          if (element instanceof HTMLSelectElement) {
            const option = Array.from(element.options).find((candidate) => matchOption(candidate.textContent ?? "") || matchOption(candidate.label ?? ""));
            if (!option) {
              return { selected: false, availableOptions: Array.from(element.options).map((candidate) => candidate.textContent?.trim() ?? "") };
            }
            element.value = option.value;
            element.dispatchEvent(new Event("input", { bubbles: true }));
            element.dispatchEvent(new Event("change", { bubbles: true }));
            return { selected: true, controlType: "native_select", selectedValue: option.value, selectedLabel: option.textContent?.trim() ?? option.label ?? "" };
          }

          const input = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element : element.querySelector("input, textarea");
          const popupId = element.getAttribute("aria-controls") ?? element.getAttribute("aria-owns") ?? input?.getAttribute("aria-controls") ?? input?.getAttribute("aria-owns") ?? null;
          const role = element.getAttribute("role")?.trim().toLowerCase() ?? input?.getAttribute("role")?.trim().toLowerCase() ?? null;
          const isCombobox = role === "combobox" || Boolean(input?.getAttribute("aria-autocomplete") ?? element.getAttribute("aria-autocomplete") ?? popupId);
          if (isCombobox) return { selected: false, controlType: "combobox", popupId };
          return { selected: false, controlType: "unsupported", unsupportedTag: element.tagName.toLowerCase() };
        }, optionText);

        if (selectionResult?.controlType === "combobox") {
          await locator.click().catch(() => locator.focus().catch(() => undefined));
          const typedIntoCombobox = await fillComboboxValue(locator, page, optionText);
          if (!typedIntoCombobox) {
            return { success: false, error: "Combobox did not receive focus before typing", data: { role, name: name.slice(0, 50), index, optionText: optionText.slice(0, 50) } };
          }
          await page.waitForTimeout(250);

          let matchedOption = false;
          try {
            matchedOption = await clickMatchingComboboxOption(buildComboboxOptionScopes(page, selectionResult.popupId ?? null), optionText);
          } catch {
            matchedOption = false;
          }

          const comboboxSelection = await readComboboxSelection(locator);
          if (!matchedOption && !comboboxSelectionMatchesOption(comboboxSelection, optionText)) {
            return {
              success: false,
              error: `Option "${optionText}" was not found`,
              data: {
                role,
                name: name.slice(0, 50),
                index,
                optionText: optionText.slice(0, 50),
                selectedLabel: comboboxSelection.selectedLabel,
                selectedValue: comboboxSelection.selectedValue,
              },
            };
          }

          if (submit) {
            await page.keyboard.press("Enter").catch(() => locator.press("Enter").catch(() => undefined));
            await page.waitForTimeout(1500);
          } else {
            await page.waitForTimeout(750);
          }

          const newUrl = page.url();
          const navigated = newUrl !== previousUrl;
          if (navigated) {
            const urlValidation = isAllowedUrl(newUrl, context.config.navigationPolicy);
            if (!urlValidation.valid) {
              const recovery = await recoverFromOffAllowlist(page, newUrl, previousUrl, context.config.navigationPolicy);
              if (recovery.recovered && recovery.recoveredUrl) state.currentUrl = recovery.recoveredUrl;
              return { success: false, error: recovery.error, data: { role, name: name.slice(0, 50), index, optionText: optionText.slice(0, 50), invalidUrl: newUrl, recovered: recovery.recovered } };
            }
            clearFailedInteractionAttemptsAfterNavigation(state);
            state.currentUrl = newUrl;
            state.visitedUrls.add(newUrl);
          } else {
            await syncFailedInteractionAttemptsWithPageState(page, state);
          }

          return { success: true, data: { role, name: name.slice(0, 50), index, optionText: optionText.slice(0, 50), submitted: submit, navigated, newUrl: navigated ? newUrl : undefined, selectedLabel: comboboxSelection.selectedLabel ?? optionText, selectedValue: comboboxSelection.selectedValue ?? null } };
        }

        if (!selectionResult?.selected) {
          return { success: false, error: selectionResult?.unsupportedTag ? `select_option supports native select elements and common combobox widgets; received ${selectionResult.unsupportedTag}` : `Option "${optionText}" was not found`, data: selectionResult };
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
          const urlValidation = isAllowedUrl(newUrl, context.config.navigationPolicy);
          if (!urlValidation.valid) {
            const recovery = await recoverFromOffAllowlist(page, newUrl, previousUrl, context.config.navigationPolicy);
            if (recovery.recovered && recovery.recoveredUrl) state.currentUrl = recovery.recoveredUrl;
            return { success: false, error: recovery.error, data: { role, name: name.slice(0, 50), index, optionText: optionText.slice(0, 50), invalidUrl: newUrl, recovered: recovery.recovered } };
          }
          clearFailedInteractionAttemptsAfterNavigation(state);
          state.currentUrl = newUrl;
          state.visitedUrls.add(newUrl);
        } else {
          await syncFailedInteractionAttemptsWithPageState(page, state);
        }

        return { success: true, data: { role, name: name.slice(0, 50), index, optionText: optionText.slice(0, 50), submitted: submit, navigated, newUrl: navigated ? newUrl : undefined, selectedLabel: selectionResult.selectedLabel ?? optionText, selectedValue: selectionResult.selectedValue ?? null } };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Select option failed";
        const interactionAttemptKey = `${role}:${name}:${index}`;
        const priorAttempt = state.failedInteractionAttempts?.get(interactionAttemptKey);
        recordFailedInteractionAttempt(state, interactionAttemptKey, priorAttempt, errorMessage);

        const currentUrl = page.url();
        if (currentUrl) {
          const urlCheck = isAllowedUrl(currentUrl, context.config.navigationPolicy);
          if (!urlCheck.valid) {
            const recovery = await recoverFromOffAllowlist(page, currentUrl, state.currentUrl, context.config.navigationPolicy);
            if (recovery.recovered && recovery.recoveredUrl) state.currentUrl = recovery.recoveredUrl;
          } else {
            state.currentUrl = currentUrl;
          }
        }

        return { success: false, error: errorMessage, data: { role, name: name.slice(0, 50), index, optionText: optionText.slice(0, 50) } };
      }
    },
  },
];
