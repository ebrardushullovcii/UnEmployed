import { isAllowedUrl } from "../allowlist";
import type { ToolDefinition } from "../types";
import {
  dismissObstructiveOverlays,
  GoBackSchema,
  NavigateSchema,
  recoverFromOffAllowlist,
  ScrollDownSchema,
  ScrollToTopSchema,
} from "./shared";

const MAX_NETWORKIDLE_TIMEOUT = 7000;

export const navigationTools: ToolDefinition[] = [
  {
    name: "navigate",
    description: `Navigate to a URL. Use this to go to job sites or specific pages.
    
    You control the timeout strategy:
    - For fast pages: use timeout 5000 (5 seconds)
    - For slow pages: use timeout 30000 (30 seconds)  
    - Prefer "domcontentloaded" on SPA job boards. "networkidle" can stall on background polling and is automatically capped.`,
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to navigate to" },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds (default: 30000). Use shorter timeouts (5000-10000) for faster navigation, longer (30000+) for heavy pages.",
          default: 30000,
        },
        waitFor: {
          type: "string",
          enum: ["domcontentloaded", "load", "networkidle"],
          description: 'What to wait for before considering navigation complete. Use "domcontentloaded" for speed, "networkidle" for full page load.',
          default: "domcontentloaded",
        },
      },
      required: ["url"],
    },
    execute: async (args, context) => {
      const parseResult = NavigateSchema.safeParse(args);
      if (!parseResult.success) {
        return { success: false, error: `Invalid navigate arguments: ${parseResult.error.issues.map((i) => i.message).join(", ")}` };
      }
      const { url, timeout, waitFor } = parseResult.data;
      const { page, state } = context;
      const startTime = Date.now();
      const previousUrl = state.currentUrl;
      const effectiveTimeout =
        waitFor === "networkidle" ? Math.min(timeout, MAX_NETWORKIDLE_TIMEOUT) : timeout;

      const urlValidation = isAllowedUrl(url, context.config.navigationPolicy);
      if (!urlValidation.valid) {
        return { success: false, error: urlValidation.error ?? "URL validation failed" };
      }

      try {
        await page.goto(url, { waitUntil: waitFor, timeout: effectiveTimeout });
        await dismissObstructiveOverlays(page);

        const finalUrl = page.url();
        const loadTime = Date.now() - startTime;
        const finalUrlValidation = isAllowedUrl(finalUrl, context.config.navigationPolicy);
        if (!finalUrlValidation.valid) {
          const recovery = await recoverFromOffAllowlist(page, finalUrl, state.currentUrl, context.config.navigationPolicy);
          if (recovery.recovered && recovery.recoveredUrl && isAllowedUrl(recovery.recoveredUrl, context.config.navigationPolicy).valid) {
            state.currentUrl = recovery.recoveredUrl;
          }
          return { success: false, error: recovery.error, data: { requestedUrl: url, finalUrl, recovered: recovery.recovered } };
        }

        if (finalUrl !== state.currentUrl) {
          state.failedInteractionAttempts?.clear();
        }
        state.currentUrl = finalUrl;
        state.visitedUrls.add(finalUrl);

        return { success: true, data: { url: finalUrl, title: await page.title(), loadTimeMs: loadTime, waitState: waitFor } };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Navigation failed";
        const currentUrl = page.url();
        let finalUrl = currentUrl;

        if (currentUrl) {
          const urlCheck = isAllowedUrl(currentUrl, context.config.navigationPolicy);
          if (!urlCheck.valid) {
            const recovery = await recoverFromOffAllowlist(page, currentUrl, state.currentUrl, context.config.navigationPolicy);
            if (
              recovery.recovered &&
              recovery.recoveredUrl &&
              isAllowedUrl(recovery.recoveredUrl, context.config.navigationPolicy).valid
            ) {
              finalUrl = recovery.recoveredUrl;
            }
          }
        }

        let readyState = "unknown";
        let isPartialLoad = false;

        try {
          readyState = await page.evaluate(() => document.readyState).catch(() => "unknown");
          isPartialLoad = Boolean(finalUrl && finalUrl !== "about:blank" && (finalUrl !== url || readyState !== "complete"));
        } catch {
          isPartialLoad = Boolean(finalUrl && finalUrl !== "about:blank" && finalUrl !== url);
        }

        const finalUrlAllowed =
          Boolean(finalUrl) && isAllowedUrl(finalUrl, context.config.navigationPolicy).valid;
        const changedToAllowedUrl = Boolean(finalUrl && finalUrlAllowed && finalUrl !== previousUrl);

        const isTimeoutError = /timeout/i.test(errorMessage);

        if (
          waitFor === "networkidle" &&
          isTimeoutError &&
          finalUrl &&
          finalUrlAllowed &&
          changedToAllowedUrl &&
          readyState !== "loading"
        ) {
          state.currentUrl = finalUrl;
          state.failedInteractionAttempts?.clear();
          state.visitedUrls.add(finalUrl);

          return {
            success: true,
            data: {
              url: finalUrl,
              title: await page.title().catch(() => ""),
              loadTimeMs: Date.now() - startTime,
              waitState: waitFor,
              waitStateReached: false,
              partialLoad: true,
              readyState,
              timeElapsed: Date.now() - startTime,
            },
          };
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
            errorType: /timeout/i.test(errorMessage) ? "timeout" : "navigation_error",
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
        amount: { type: "number", description: "Pixels to scroll (default: 800, which is about one screen)", default: 800 },
        delayMs: { type: "number", description: "Milliseconds to wait after scrolling before checking for more content (default: 1000)", default: 1000 },
      },
    },
    execute: async (args, context) => {
      const parseResult = ScrollDownSchema.safeParse(args);
      if (!parseResult.success) {
        return { success: false, error: `Invalid scroll_down arguments: ${parseResult.error.issues.map((i) => i.message).join(", ")}` };
      }
      const { amount, delayMs } = parseResult.data;
      const { page } = context;

      try {
        await dismissObstructiveOverlays(page);
        const beforeInfo = await page.evaluate(() => ({ scrollY: window.scrollY, scrollHeight: document.body.scrollHeight, clientHeight: window.innerHeight }));
        await page.evaluate((scrollAmount) => window.scrollBy(0, scrollAmount), amount);
        await page.waitForTimeout(delayMs);
        const afterInfo = await page.evaluate(() => ({ scrollY: window.scrollY, scrollHeight: document.body.scrollHeight, clientHeight: window.innerHeight }));
        const scrolledToBottom = afterInfo.scrollY + afterInfo.clientHeight >= afterInfo.scrollHeight - 100;
        const newContentLoaded = afterInfo.scrollHeight > beforeInfo.scrollHeight;

        return { success: true, data: { scrolledPixels: amount, newScrollY: afterInfo.scrollY, totalHeight: afterInfo.scrollHeight, scrolledToBottom, newContentLoaded, canScrollMore: !scrolledToBottom } };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Scroll failed" };
      }
    },
  },
  {
    name: "scroll_to_top",
    description: `Scroll back to the top of the current page.

Use this when search boxes, filters, or header controls may be above the current scroll position and need to be re-checked.`,
    parameters: {
      type: "object",
      properties: {
        delayMs: { type: "number", description: "Milliseconds to wait after returning to the top before checking the page state (default: 800)", default: 800 },
      },
    },
    execute: async (args, context) => {
      const parseResult = ScrollToTopSchema.safeParse(args);
      if (!parseResult.success) {
        return { success: false, error: `Invalid scroll_to_top arguments: ${parseResult.error.issues.map((i) => i.message).join(", ")}` };
      }

      const { delayMs } = parseResult.data;
      const { page } = context;

      try {
        await dismissObstructiveOverlays(page);
        const beforeInfo = await page.evaluate(() => ({ scrollY: window.scrollY, scrollHeight: document.body.scrollHeight, clientHeight: window.innerHeight }));
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(delayMs);
        const afterInfo = await page.evaluate(() => ({ scrollY: window.scrollY, scrollHeight: document.body.scrollHeight, clientHeight: window.innerHeight }));
        return { success: true, data: { previousScrollY: beforeInfo.scrollY, newScrollY: afterInfo.scrollY, totalHeight: afterInfo.scrollHeight, returnedToTop: afterInfo.scrollY <= 10 } };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Scroll to top failed" };
      }
    },
  },
  {
    name: "go_back",
    description: `Navigate back to the previous page.
    
Use this after viewing a job detail to return to search results.`,
    parameters: { type: "object", properties: {}, required: [] },
    execute: async (args, context) => {
      const parseResult = GoBackSchema.safeParse(args);
      if (!parseResult.success) {
        return { success: false, error: `Invalid go_back arguments: ${parseResult.error.issues.map((i) => i.message).join(", ")}` };
      }

      const { page, state } = context;

      try {
        const previousUrl = state.currentUrl;
        await page.goBack({ waitUntil: "domcontentloaded", timeout: 10000 });
        await page.waitForTimeout(1000);
        await dismissObstructiveOverlays(page);
        const newUrl = page.url();
        const urlChanged = previousUrl !== newUrl;

        if (urlChanged) {
          const urlValidation = isAllowedUrl(newUrl, context.config.navigationPolicy);
          if (!urlValidation.valid) {
            const recovery = await recoverFromOffAllowlist(page, newUrl, previousUrl, context.config.navigationPolicy);
            if (recovery.recovered && recovery.recoveredUrl && isAllowedUrl(recovery.recoveredUrl, context.config.navigationPolicy).valid) {
              state.currentUrl = recovery.recoveredUrl;
            }
            return { success: false, error: recovery.error, data: { wentBack: false, previousUrl, invalidUrl: newUrl, recovered: recovery.recovered } };
          }
          state.failedInteractionAttempts?.clear();
          state.currentUrl = newUrl;
        }

        return { success: true, data: { wentBack: urlChanged, previousUrl, currentUrl: newUrl } };
      } catch (error) {
        const currentUrl = page.url();
        if (currentUrl) {
          const urlCheck = isAllowedUrl(currentUrl, context.config.navigationPolicy);
          if (!urlCheck.valid) {
            const recovery = await recoverFromOffAllowlist(page, currentUrl, state.currentUrl, context.config.navigationPolicy);
            if (recovery.recovered && recovery.recoveredUrl && isAllowedUrl(recovery.recoveredUrl, context.config.navigationPolicy).valid) {
              state.currentUrl = recovery.recoveredUrl;
            }
          } else {
            state.currentUrl = currentUrl;
          }
        }

        return { success: false, error: error instanceof Error ? error.message : "Go back failed" };
      }
    },
  },
];
