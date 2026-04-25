import { isAllowedUrl } from "../allowlist";
import type { ToolDefinition } from "../types";
import {
  buildInteractionAttemptKey,
  clearFailedInteractionAttemptsAfterNavigation,
  recordFailedInteractionAttempt,
  REPEATED_FAILURE_BLOCK_THRESHOLD,
  shouldTreatAsRepeatedFillFailure,
  syncFailedInteractionAttemptsWithPageState,
} from "./interaction-state";
import {
  FillSchema,
  dismissObstructiveOverlays,
  recoverFromOffAllowlist,
  resolveRoleLocator,
} from "./shared";

export const fillTool: ToolDefinition = {
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
    if (!parseResult.success) {
      return {
        success: false,
        error: `Invalid fill arguments: ${parseResult.error.issues.map((i) => i.message).join(", ")}`,
      };
    }

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
      await dismissObstructiveOverlays(page);
      const locator = await resolveRoleLocator(page, role, name, index);
      await locator.fill(text);
      if (submit) {
        await locator.press("Enter");
        await page.waitForTimeout(1500);
        const newUrl = page.url();
        if (newUrl !== state.currentUrl) {
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
                name: name.slice(0, 30),
                index,
                invalidUrl: newUrl,
                recovered: recovery.recovered,
                errorType: "fill_failed",
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
      } else {
        state.failedInteractionAttempts?.delete(interactionAttemptKey);
      }

      return {
        success: true,
        data: { role, name: name.slice(0, 30), index, submitted: submit },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Fill failed";
      const nextFailureCount = recordFailedInteractionAttempt(
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
          name: name.slice(0, 30),
          index,
          errorType: /timeout/i.test(errorMessage) ? "timeout" : "fill_failed",
          repeatedFailureCount: nextFailureCount,
        },
      };
    }
  },
};
