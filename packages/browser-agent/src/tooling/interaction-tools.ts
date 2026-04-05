import { isAllowedUrl } from "../allowlist";
import type { ToolDefinition } from "../types";
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
            const absoluteUrl = new URL(href, state.currentUrl || page.url()).toString()
            const urlValidation = isAllowedUrl(absoluteUrl, context.config.navigationPolicy)

            if (urlValidation.valid) {
              await page.goto(absoluteUrl, { waitUntil: 'domcontentloaded', timeout: CLICK_TIMEOUT_MS })
              const newUrl = page.url()
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
        }

        const text = await locator.textContent().catch(() => null);
        await locator.click({ timeout: CLICK_TIMEOUT_MS });
        await page.waitForTimeout(1000);

        const newUrl = page.url();
        const navigated = newUrl !== state.currentUrl;

        if (navigated) {
          const urlValidation = isAllowedUrl(newUrl, context.config.navigationPolicy);
          if (!urlValidation.valid) {
            const recovery = await recoverFromOffAllowlist(page, newUrl, state.currentUrl, context.config.navigationPolicy);
            if (recovery.recovered && recovery.recoveredUrl) state.currentUrl = recovery.recoveredUrl;
            return { success: false, error: recovery.error, data: { role, name: name.slice(0, 50), index, invalidUrl: newUrl, recovered: recovery.recovered } };
          }
          state.currentUrl = newUrl;
          state.visitedUrls.add(newUrl);
        }

        return { success: true, data: { role, name: name.slice(0, 50), index, text: text?.slice(0, 100), navigated, newUrl: navigated ? newUrl : undefined } };
      } catch (error) {
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

        return { success: false, error: error instanceof Error ? error.message : "Click failed", data: { role, name: name.slice(0, 50), index, errorType: error instanceof Error && error.message.includes("timeout") ? "timeout" : "click_failed" } };
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
              if (recovery.recovered && recovery.recoveredUrl) state.currentUrl = recovery.recoveredUrl;
              return { success: false, error: recovery.error, data: { role, name: name.slice(0, 30), index, invalidUrl: newUrl, recovered: recovery.recovered } };
            }
            state.currentUrl = newUrl;
            state.visitedUrls.add(newUrl);
          }
        }

        return { success: true, data: { role, name: name.slice(0, 30), index, submitted: submit } };
      } catch (error) {
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

        return { success: false, error: error instanceof Error ? error.message : "Fill failed", data: { role, name: name.slice(0, 30), index } };
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
            state.currentUrl = newUrl;
            state.visitedUrls.add(newUrl);
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
          state.currentUrl = newUrl;
          state.visitedUrls.add(newUrl);
        }

        return { success: true, data: { role, name: name.slice(0, 50), index, optionText: optionText.slice(0, 50), submitted: submit, navigated, newUrl: navigated ? newUrl : undefined, selectedLabel: selectionResult.selectedLabel ?? optionText, selectedValue: selectionResult.selectedValue ?? null } };
      } catch (error) {
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

        return { success: false, error: error instanceof Error ? error.message : "Select option failed", data: { role, name: name.slice(0, 50), index, optionText: optionText.slice(0, 50) } };
      }
    },
  },
];
