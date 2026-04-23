import type { ToolDefinition } from "../types";
import {
  dismissObstructiveOverlays,
  mergeInteractiveElementCandidates,
  parseInteractiveElementsFromAriaSnapshot,
  prioritizeInteractiveElements,
} from "./shared";

export const getInteractiveElementsTool: ToolDefinition = {
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
      await dismissObstructiveOverlays(page);
      const snapshot = await page.locator("body").ariaSnapshot().catch(() => "");
      const ariaElements = snapshot ? parseInteractiveElementsFromAriaSnapshot(snapshot) : [];
      const domElements = await page.evaluate(() => {
        const roleFromInputType = (element: HTMLInputElement): string => {
          const type = (element.getAttribute("type") ?? "text").toLowerCase();
          if (type === "search") return "searchbox";
          if (type === "checkbox") return "checkbox";
          if (type === "radio") return "radio";
          if (type === "range") return "slider";
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
            const labels = Array.from(
              (element as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).labels ?? [],
            )
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
              !element.closest('[aria-hidden="true"], [hidden], [inert], template') &&
              !element.closest('[aria-disabled="true"], [disabled]') &&
              !element.hasAttribute("inert") &&
              !element.hasAttribute("disabled") &&
              element.getAttribute("aria-disabled") !== "true",
          )
          .filter(isVisible)
          .map((element) => ({ role: resolveRole(element), name: readElementName(element) }))
          .filter((element) => element.role && element.name);
      });

      const mergedElements = mergeInteractiveElementCandidates(ariaElements, domElements);
      const prioritizedElements = prioritizeInteractiveElements(mergedElements);

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
        error: error instanceof Error ? error.message : "Failed to get page elements",
      };
    }
  },
};
