import { isAllowedUrl } from "../allowlist";
import type { ToolDefinition } from "../types";
import {
  NavigateSchema,
  recoverFromOffAllowlist,
  ScrollDownSchema,
  ScrollToTopSchema,
} from "./shared";

export const navigationTools: ToolDefinition[] = [
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

      const urlValidation = isAllowedUrl(url, context.config.navigationPolicy);
      if (!urlValidation.valid) {
        return { success: false, error: urlValidation.error ?? "URL validation failed" };
      }

      try {
        await page.goto(url, { waitUntil: waitFor, timeout });

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
            if (recovery.recovered && recovery.recoveredUrl) {
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

        if (finalUrl && isAllowedUrl(finalUrl, context.config.navigationPolicy).valid) {
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
            errorType: errorMessage.includes("timeout") ? "timeout" : "navigation_error",
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
    parameters: { type: "object", properties: {} },
    execute: async (args, context) => {
      const parseResult = ScrollToTopSchema.safeParse(args);
      if (!parseResult.success) {
        return { success: false, error: `Invalid scroll_to_top arguments: ${parseResult.error.issues.map((i) => i.message).join(", ")}` };
      }

      const { page } = context;

      try {
        const beforeInfo = await page.evaluate(() => ({ scrollY: window.scrollY, scrollHeight: document.body.scrollHeight, clientHeight: window.innerHeight }));
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(800);
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
    parameters: { type: "object", properties: {} },
    execute: async (_args, context) => {
      const { page, state } = context;

      try {
        const previousUrl = state.currentUrl;
        await page.goBack({ waitUntil: "domcontentloaded", timeout: 10000 });
        await page.waitForTimeout(1000);
        const newUrl = page.url();
        const urlChanged = previousUrl !== newUrl;

        if (urlChanged) {
          const urlValidation = isAllowedUrl(newUrl, context.config.navigationPolicy);
          if (!urlValidation.valid) {
            const recovery = await recoverFromOffAllowlist(page, newUrl, previousUrl, context.config.navigationPolicy);
            if (recovery.recovered && recovery.recoveredUrl) {
              state.currentUrl = recovery.recoveredUrl;
            }
            return { success: false, error: recovery.error, data: { wentBack: false, previousUrl, invalidUrl: newUrl, recovered: recovery.recovered } };
          }
          state.currentUrl = newUrl;
        }

        return { success: true, data: { wentBack: urlChanged, previousUrl, currentUrl: newUrl } };
      } catch (error) {
        const currentUrl = page.url();
        if (currentUrl) {
          const urlCheck = isAllowedUrl(currentUrl, context.config.navigationPolicy);
          if (!urlCheck.valid) {
            const recovery = await recoverFromOffAllowlist(page, currentUrl, state.currentUrl, context.config.navigationPolicy);
            if (recovery.recovered && recovery.recoveredUrl) {
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
