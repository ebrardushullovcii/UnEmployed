import type { Locator } from "playwright";
import { isAllowedUrl } from "../allowlist";
import type { ToolDefinition } from "../types";
import {
  buildInteractionAttemptKey,
  clearFailedInteractionAttemptsAfterNavigation,
  CLICK_TIMEOUT_MS,
  recordFailedInteractionAttempt,
  REPEATED_FAILURE_BLOCK_THRESHOLD,
  shouldTreatAsRepeatedClickFailure,
  summarizeClickFailure,
  syncFailedInteractionAttemptsWithPageState,
} from "./interaction-state";
import {
  ClickSchema,
  dismissObstructiveOverlays,
  recoverFromOffAllowlist,
  resolveRoleLocator,
} from "./shared";

async function clickCheckboxWithLabelFallback(locator: Locator): Promise<boolean> {
  const inputId = await locator.getAttribute("id").catch(() => null);
  const labelForSelector = inputId
    ? `label[for="${inputId.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`
    : null;
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

    const forAttr = await labelLocator.getAttribute("for").catch(() => null);
    const inputLocator = forAttr
      ? labelLocator.page().locator(`[id="${forAttr.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`)
      : labelLocator.locator('input[type="checkbox"], input[type="radio"]').first();

    const inputCount = await inputLocator.count().catch(() => 0);
    if (inputCount === 0) return false;
    const initialChecked = await inputLocator.isChecked().catch(() => false);
    await labelLocator.scrollIntoViewIfNeeded().catch(() => {});
    await labelLocator.click({ timeout: CLICK_TIMEOUT_MS / 2 }).catch(() => {});
    const checkedAfter = await inputLocator.isChecked().catch(() => initialChecked);
    return checkedAfter !== initialChecked;
  };

  if (explicitLabel && (await tryLabel(explicitLabel).catch(() => false))) {
    return true;
  }

  return await tryLabel(wrappingLabel).catch(() => false);
}

export const clickTool: ToolDefinition = {
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
    if (!parseResult.success) {
      return {
        success: false,
        error: `Invalid click arguments: ${parseResult.error.issues.map((i) => i.message).join(", ")}`,
      };
    }

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
      await dismissObstructiveOverlays(page).catch((error: unknown) => {
        console.warn("[Agent] Failed to dismiss obstructive overlays before click", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
      const locator = await resolveRoleLocator(page, role, name, index);
      const isVisible = await locator.isVisible().catch(() => false);
      if (!isVisible && retryIfNotVisible) {
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(500);
      }
      const visibleAfterScroll = await locator.isVisible().catch(() => false);

      if (!visibleAfterScroll && role === "link") {
        const href = await locator.getAttribute("href").catch(() => null);

        if (href) {
          const pageUrl = page.url();
          const previousUrl = state.currentUrl || pageUrl;
          const absoluteUrl = new URL(href, pageUrl).toString();
          const urlValidation = isAllowedUrl(absoluteUrl, context.config.navigationPolicy);

          if (!urlValidation.valid) {
            const repeatedFailureCount = recordFailedInteractionAttempt(
              state,
              interactionAttemptKey,
              priorAttempt,
              urlValidation.error ?? "Navigation went to disallowed URL.",
            );

            return {
              success: false,
              error: urlValidation.error ?? "Navigation went to disallowed URL.",
              data: {
                role,
                name: name.slice(0, 50),
                index,
                invalidUrl: absoluteUrl,
                recovered: false,
                navigationMethod: "href_fallback",
                errorType: "not_allowed_by_navigation_policy",
                repeatedFailureCount,
              },
            };
          }

          await page.goto(absoluteUrl, { waitUntil: "domcontentloaded", timeout: CLICK_TIMEOUT_MS });
          const newUrl = page.url();
          const finalUrlValidation = isAllowedUrl(newUrl, context.config.navigationPolicy);

          if (!finalUrlValidation.valid) {
            const recovery = await recoverFromOffAllowlist(
              page,
              newUrl,
              previousUrl,
              context.config.navigationPolicy,
            );
            const repeatedFailureCount = recordFailedInteractionAttempt(
              state,
              interactionAttemptKey,
              priorAttempt,
              recovery.error,
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
                navigationMethod: "href_fallback",
                errorType: "click_failed",
                repeatedFailureCount,
              },
            };
          }

          clearFailedInteractionAttemptsAfterNavigation(state);
          state.currentUrl = newUrl;
          state.visitedUrls.add(newUrl);

          return {
            success: true,
            data: {
              role,
              name: name.slice(0, 50),
              index,
              text: await locator.textContent().catch(() => null),
              navigated: true,
              newUrl,
              navigationMethod: "href_fallback",
            },
          };
        }
      }

      const text = await locator.textContent().catch(() => null);
      try {
        await locator.click({ timeout: CLICK_TIMEOUT_MS });
      } catch (clickError) {
        const canUseCheckboxLabelFallback =
          (role === "checkbox" || role === "radio") &&
          /intercepts pointer events/i.test(
            clickError instanceof Error ? clickError.message : String(clickError),
          );

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
          const recovery = await recoverFromOffAllowlist(
            page,
            newUrl,
            state.currentUrl,
            context.config.navigationPolicy,
          );
          const repeatedFailureCount = recordFailedInteractionAttempt(
            state,
            interactionAttemptKey,
            priorAttempt,
            recovery.error,
          );
          if (recovery.recovered && recovery.recoveredUrl) state.currentUrl = recovery.recoveredUrl;
          return {
            success: false,
            error: recovery.error,
            data: {
              role,
              name: name.slice(0, 50),
              index,
              invalidUrl: newUrl,
              recovered: recovery.recovered,
              errorType: "click_failed",
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
          text: text?.slice(0, 100),
          navigated,
          newUrl: navigated ? newUrl : undefined,
        },
      };
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
};
