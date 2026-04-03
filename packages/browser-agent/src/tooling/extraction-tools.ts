import type { ToolDefinition } from "../types";
import { ExtractJobsSchema } from "./shared";

export const extractionTools: ToolDefinition[] = [
  {
    name: "extract_jobs",
    retryable: true,
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
        pageType: { type: "string", enum: ["search_results", "job_detail", "company_page", "unknown"], description: "What type of page you think this is" },
        maxJobs: { type: "number", description: "Maximum jobs to extract from this page (default: 5)", default: 5 },
      },
      required: ["pageType"],
    },
    execute: async (args, context) => {
      const parseResult = ExtractJobsSchema.safeParse(args);
      if (!parseResult.success) return { success: false, error: `Invalid extract_jobs arguments: ${parseResult.error.issues.map((i) => i.message).join(", ")}` };
      const { pageType, maxJobs } = parseResult.data;
      const { page } = context;

      try {
        const pageText = await page.locator("body").innerText();
        const pageUrl = page.url();
        const pageTextLength = pageText.length;
        const relevantUrlSubstrings = context.config.extractionContext?.relevantUrlSubstrings ?? [];
        const discoveredUrls = await page.evaluate(
          (input: { allowedHostnames: string[]; relevantUrlSubstrings: string[]; allowSubdomains: boolean }) => {
            const urls = new Set<string>();
            for (const anchor of Array.from(document.querySelectorAll("a[href]"))) {
              const href = anchor.getAttribute("href");
              if (!href) continue;
              try {
                const absoluteUrl = new URL(href, window.location.href).toString();
                const parsedUrl = new URL(absoluteUrl);
                const canonicalUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;
                const hostname = parsedUrl.hostname.toLowerCase();
                const hostAllowed = input.allowedHostnames.some((allowedHostname) => hostname === allowedHostname || (input.allowSubdomains && hostname.endsWith(`.${allowedHostname}`)));
                if (!hostAllowed) continue;
                const haystack = `${parsedUrl.pathname}${parsedUrl.search}`.toLowerCase();
                const matchesRelevantUrl = input.relevantUrlSubstrings.length === 0 || input.relevantUrlSubstrings.some((substring) => haystack.includes(substring.toLowerCase()));
                if (matchesRelevantUrl) urls.add(canonicalUrl);
              } catch {
                // Ignore invalid href values.
              }
            }
            return Array.from(urls).slice(0, 30);
          },
          {
            allowedHostnames: context.config.navigationPolicy.allowedHostnames.map((hostname) => hostname.toLowerCase()),
            relevantUrlSubstrings,
            allowSubdomains: context.config.navigationPolicy.allowSubdomains === true,
          },
        );

        const MAX_PAGE_TEXT_CHARS = 8000;
        const urlAppendix = discoveredUrls.length > 0 ? `\n\nRelevant in-scope URLs found on page:\n${discoveredUrls.map((url) => `- ${url}`).join("\n")}` : "";
        const truncationNotice = "\n... [content truncated]";
        const pageTextBudget = Math.max(0, MAX_PAGE_TEXT_CHARS - urlAppendix.length);
        const pageTextTruncated = pageText.length + urlAppendix.length > MAX_PAGE_TEXT_CHARS;
        const truncatedPageText = pageTextTruncated ? `${pageText.slice(0, Math.max(0, pageTextBudget - truncationNotice.length))}${truncationNotice}${urlAppendix}` : `${pageText}${urlAppendix}`;
        const extractionTextLength = pageText.length + urlAppendix.length;

        const hasMinimumContent = pageTextLength > 500;
        const loadingPatterns = [/loading\.\.\./i, /loading\s*$/im, /^loading$/im, /please wait/i, /please wait\.\.\./i, /spinner/i, /fetching/i, /retrieving/i];
        const hasNoLoadingIndicators = !loadingPatterns.some((pattern) => pattern.test(pageText));
        const lowerText = pageText.toLowerCase();
        let hasJobContent = false;

        if (pageType === "search_results") {
          hasJobContent = ["job", "jobs", "position", "positions", "apply", "career", "careers", "opening", "openings", "vacancy", "vacancies", "role", "roles", "konkurs", "pune", "punes", "punesim", "punetor", "pozit", "pozita", "pozite", "karriere", "karrier", "apliko", "aplikim", "vende te lira", "vende pune"].some((keyword) => lowerText.includes(keyword));
        } else if (pageType === "job_detail" || pageType === "company_page") {
          hasJobContent = ["description", "requirements", "qualifications", "responsibilities", "career", "careers", "openings", "hiring", "job", "position", "apply", "pershkrim", "detyr", "kualifik", "kerkes", "kerkesa", "pergjegjes", "pergjegjesi", "apliko", "konkurs", "pune", "pozit", "karriere", "orari"].some((keyword) => lowerText.includes(keyword));
        } else {
          hasJobContent = pageTextLength > 1000;
        }

        const readyForExtraction = hasMinimumContent && hasNoLoadingIndicators && hasJobContent;

        return { success: true, data: { pageType, pageUrl, pageText: truncatedPageText, pageTextLength: extractionTextLength, pageTextTruncated, readyForExtraction, maxJobs, linkedInJobUrlsFound: discoveredUrls.length, checks: { hasMinimumContent, hasNoLoadingIndicators, hasJobContent } } };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to extract jobs" };
      }
    },
  },
];
