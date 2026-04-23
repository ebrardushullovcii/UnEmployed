import { isAllowedUrl } from "../allowlist";
import type { ToolDefinition } from "../types";
import {
  buildInteractionAttemptKey,
  clearFailedInteractionAttemptsAfterNavigation,
  comboboxSelectionMatchesOption,
  recordFailedInteractionAttempt,
  REPEATED_FAILURE_BLOCK_THRESHOLD,
  shouldTreatAsRepeatedSelectOptionFailure,
  syncFailedInteractionAttemptsWithPageState,
} from "./interaction-state";
import {
  buildComboboxOptionScopes,
  clickMatchingComboboxOption,
  dismissObstructiveOverlays,
  fillComboboxValue,
  readComboboxSelection,
  recoverFromOffAllowlist,
  resolveRoleLocator,
  SelectOptionSchema,
} from "./shared";

export const selectOptionTool: ToolDefinition = {
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
    if (!parseResult.success) {
      return {
        success: false,
        error: `Invalid select_option arguments: ${parseResult.error.issues.map((issue) => issue.message).join(", ")}`,
      };
    }

    const { role, name, optionText, index, submit } = parseResult.data;
    const { page, state } = context;
    const previousUrl = state.currentUrl;
    await syncFailedInteractionAttemptsWithPageState(page, state);
    const interactionAttemptKey = buildInteractionAttemptKey(
      "select_option",
      role,
      name,
      index,
      optionText,
    );
    const priorAttempt = state.failedInteractionAttempts?.get(interactionAttemptKey);

    if (
      priorAttempt &&
      priorAttempt.count >= REPEATED_FAILURE_BLOCK_THRESHOLD &&
      shouldTreatAsRepeatedSelectOptionFailure(priorAttempt.lastError)
    ) {
      return {
        success: false,
        error: `Skipping repeated select_option attempt for ${role} "${name}" after ${priorAttempt.count} similar failures: ${priorAttempt.lastError}`,
        data: {
          role,
          name: name.slice(0, 50),
          index,
          errorType: "repeated_select_blocked",
        },
      };
    }

    try {
      await dismissObstructiveOverlays(page);
      const locator = await resolveRoleLocator(page, role, name, index);
      const elementHandle = await locator.elementHandle();
      if (!elementHandle) {
        const errorMsg = "Dropdown element not found";
        const repeatedFailureCount = recordFailedInteractionAttempt(
          state,
          interactionAttemptKey,
          priorAttempt,
          errorMsg,
        );
        return {
          success: false,
          error: errorMsg,
          data: {
            role,
            name: name.slice(0, 50),
            index,
            errorType: "select_failed",
            repeatedFailureCount,
          },
        };
      }

      const selectionResult = await elementHandle.evaluate((element, targetOptionText) => {
        const normalizedTarget = targetOptionText.trim().toLowerCase();
        const matchOption = (text: string) => text.trim().toLowerCase() === normalizedTarget;

        if (element instanceof HTMLSelectElement) {
          const option = Array.from(element.options).find(
            (candidate) =>
              matchOption(candidate.textContent ?? "") || matchOption(candidate.label ?? ""),
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
            controlType: "native_select",
            selectedValue: option.value,
            selectedLabel: option.textContent?.trim() ?? option.label ?? "",
          };
        }

        const input =
          element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
            ? element
            : element.querySelector("input, textarea");
        const popupId =
          element.getAttribute("aria-controls") ??
          element.getAttribute("aria-owns") ??
          input?.getAttribute("aria-controls") ??
          input?.getAttribute("aria-owns") ??
          null;
        const resolvedRole =
          element.getAttribute("role")?.trim().toLowerCase() ??
          input?.getAttribute("role")?.trim().toLowerCase() ??
          null;
        const isCombobox =
          resolvedRole === "combobox" ||
          Boolean(input?.getAttribute("aria-autocomplete") ?? element.getAttribute("aria-autocomplete") ?? popupId);
        if (isCombobox) return { selected: false, controlType: "combobox", popupId };
        return { selected: false, controlType: "unsupported", unsupportedTag: element.tagName.toLowerCase() };
      }, optionText);

      if (selectionResult?.controlType === "combobox") {
        await locator.click().catch(() => locator.focus().catch(() => undefined));
        const typedIntoCombobox = await fillComboboxValue(locator, page, optionText);
        if (!typedIntoCombobox) {
          const errorMsg = "Combobox did not receive focus before typing";
          const repeatedFailureCount = recordFailedInteractionAttempt(
            state,
            interactionAttemptKey,
            priorAttempt,
            errorMsg,
          );
          return {
            success: false,
            error: errorMsg,
            data: {
              role,
              name: name.slice(0, 50),
              index,
              optionText: optionText.slice(0, 50),
              errorType: "select_failed",
              repeatedFailureCount,
            },
          };
        }
        await page.waitForTimeout(250);

        let matchedOption = false;
        try {
          matchedOption = await clickMatchingComboboxOption(
            buildComboboxOptionScopes(page, selectionResult.popupId ?? null),
            optionText,
          );
        } catch {
          matchedOption = false;
        }

        const comboboxSelection = await readComboboxSelection(locator);
        if (!matchedOption && !comboboxSelectionMatchesOption(comboboxSelection, optionText)) {
          const errorMsg = `Option "${optionText}" was not found`;
          const repeatedFailureCount = recordFailedInteractionAttempt(
            state,
            interactionAttemptKey,
            priorAttempt,
            errorMsg,
          );
          return {
            success: false,
            error: errorMsg,
            data: {
              role,
              name: name.slice(0, 50),
              index,
              optionText: optionText.slice(0, 50),
              selectedLabel: comboboxSelection.selectedLabel,
              selectedValue: comboboxSelection.selectedValue,
              errorType: "select_failed",
              repeatedFailureCount,
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
            const recovery = await recoverFromOffAllowlist(
              page,
              newUrl,
              previousUrl,
              context.config.navigationPolicy,
            );
            if (recovery.recovered && recovery.recoveredUrl) state.currentUrl = recovery.recoveredUrl;
            const repeatedFailureCount = recordFailedInteractionAttempt(
              state,
              interactionAttemptKey,
              priorAttempt,
              recovery.error ?? "Navigation went to disallowed URL.",
            );
            return {
              success: false,
              error: recovery.error ?? "Navigation went to disallowed URL.",
              data: {
                role,
                name: name.slice(0, 50),
                index,
                optionText: optionText.slice(0, 50),
                invalidUrl: newUrl,
                recovered: recovery.recovered,
                errorType: "select_failed",
                repeatedFailureCount,
              },
            };
          }
          clearFailedInteractionAttemptsAfterNavigation(state);
          state.currentUrl = newUrl;
          state.visitedUrls.add(newUrl);
        } else {
          state.failedInteractionAttempts?.delete(interactionAttemptKey);
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
            selectedLabel: comboboxSelection.selectedLabel ?? optionText,
            selectedValue: comboboxSelection.selectedValue ?? null,
          },
        };
      }

      if (!selectionResult?.selected) {
        const errorMsg = selectionResult?.unsupportedTag
          ? `select_option supports native select elements and common combobox widgets; received ${selectionResult.unsupportedTag}`
          : `Option "${optionText}" was not found`;
        const repeatedFailureCount = recordFailedInteractionAttempt(
          state,
          interactionAttemptKey,
          priorAttempt,
          errorMsg,
        );
        return {
          success: false,
          error: errorMsg,
          data: {
            role,
            name: name.slice(0, 50),
            index,
            optionText: optionText.slice(0, 50),
            ...selectionResult,
            errorType: "select_failed",
            repeatedFailureCount,
          },
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
        const urlValidation = isAllowedUrl(newUrl, context.config.navigationPolicy);
        if (!urlValidation.valid) {
          const recovery = await recoverFromOffAllowlist(
            page,
            newUrl,
            previousUrl,
            context.config.navigationPolicy,
          );
          const errorMsg = recovery.error ?? "Navigation went to disallowed URL.";
          state.currentUrl = recovery.recoveredUrl ?? previousUrl;
          const repeatedFailureCount = recordFailedInteractionAttempt(
            state,
            interactionAttemptKey,
            priorAttempt,
            errorMsg,
          );
          return {
            success: false,
            error: errorMsg,
            data: {
              role,
              name: name.slice(0, 50),
              index,
              optionText: optionText.slice(0, 50),
              invalidUrl: newUrl,
              recovered: recovery.recovered,
              errorType: "select_failed",
              repeatedFailureCount,
            },
          };
        }
        clearFailedInteractionAttemptsAfterNavigation(state);
        state.currentUrl = newUrl;
        state.visitedUrls.add(newUrl);
      } else {
        state.failedInteractionAttempts?.delete(interactionAttemptKey);
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
      const errorMessage = error instanceof Error ? error.message : "Select option failed";
      const repeatedFailureCount = recordFailedInteractionAttempt(
        state,
        interactionAttemptKey,
        priorAttempt,
        errorMessage,
      );

      const currentUrl = page.url();
      if (currentUrl) {
        const urlCheck = isAllowedUrl(currentUrl, context.config.navigationPolicy);
        if (!urlCheck.valid) {
          const recovery = await recoverFromOffAllowlist(
            page,
            currentUrl,
            state.currentUrl,
            context.config.navigationPolicy,
          );
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
          name: name.slice(0, 50),
          index,
          optionText: optionText.slice(0, 50),
          errorType: "select_failed",
          repeatedFailureCount,
        },
      };
    }
  },
};
