import type { ToolDefinition } from "../types";
import { ExtractJobsSchema } from "./shared";

interface StructuredDataJobCandidate {
  canonicalUrl?: string | null;
  sourceJobId?: string | null;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  description?: string | null;
  summary?: string | null;
  postedAt?: string | null;
  postedAtText?: string | null;
  salaryText?: string | null;
  workMode?: string[] | null;
  applyPath?: "easy_apply" | "external_redirect" | "unknown" | null;
  easyApplyEligible?: boolean | null;
  keySkills?: string[] | null;
  responsibilities?: string[] | null;
  minimumQualifications?: string[] | null;
  preferredQualifications?: string[] | null;
  seniority?: string | null;
  employmentType?: string | null;
  department?: string | null;
  team?: string | null;
  employerWebsiteUrl?: string | null;
  employerDomain?: string | null;
  benefits?: string[] | null;
}

interface SearchResultCardCandidate {
  canonicalUrl: string;
  anchorText: string;
  headingText: string | null;
  lines: string[];
}

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

        const structuredCandidates = await page.evaluate(
          (input: {
            allowedHostnames: string[];
            relevantUrlSubstrings: string[];
            allowSubdomains: boolean;
          }) => {
            const toText = (value: unknown): string =>
              typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
            const uniqueStrings = (values: readonly string[]): string[] => {
              const seen = new Set<string>();
              return values.flatMap((value) => {
                const normalized = toText(value);
                if (!normalized) {
                  return [];
                }
                const key = normalized.toLowerCase();
                if (seen.has(key)) {
                  return [];
                }
                seen.add(key);
                return [normalized];
              });
            };
            const isAllowedInScopeUrl = (value: string | null | undefined): string | null => {
              if (!value) {
                return null;
              }

              try {
                const absolute = new URL(value, window.location.href);
                const hostname = absolute.hostname.toLowerCase();
                const hostAllowed = input.allowedHostnames.some(
                  (allowedHostname) =>
                    hostname === allowedHostname ||
                    (input.allowSubdomains && hostname.endsWith(`.${allowedHostname}`)),
                );
                if (!hostAllowed) {
                  return null;
                }

                const haystack = `${absolute.pathname}${absolute.search}`.toLowerCase();
                const matchesRelevantUrl =
                  input.relevantUrlSubstrings.length === 0 ||
                  input.relevantUrlSubstrings.some((substring) =>
                    haystack.includes(substring.toLowerCase()),
                  );
                if (!matchesRelevantUrl) {
                  return null;
                }

                for (const key of [...absolute.searchParams.keys()]) {
                  const lowered = key.toLowerCase();
                  if (
                    lowered.startsWith("utm_") ||
                    lowered === "trk" ||
                    lowered === "trackingid"
                  ) {
                    absolute.searchParams.delete(key);
                  }
                }

                absolute.hash = "";
                return absolute.toString();
              } catch {
                return null;
              }
            };
            const textArray = (value: unknown): string[] =>
              uniqueStrings(
                Array.isArray(value)
                  ? value.map((entry) => toText(entry))
                  : typeof value === "string"
                    ? value.split(/\n+/g).map((entry) => toText(entry))
                    : [],
              );
            const locationValue = (value: unknown): string | null => {
              if (!value || typeof value !== "object") {
                return null;
              }

              const candidate = value as Record<string, unknown>;
              return (
                toText(candidate.addressLocality) ||
                toText(candidate.addressRegion) ||
                toText(candidate.addressCountry) ||
                toText(candidate.name) ||
                null
              );
            };
            const normalizeEmploymentType = (value: unknown): string | null => {
              if (Array.isArray(value)) {
                return toText(value[0]);
              }
              return toText(value) || null;
            };
            const normalizeStructuredJob = (
              candidate: Record<string, unknown>,
            ): StructuredDataJobCandidate | null => {
              const candidateType = toText(candidate["@type"] || candidate.type).toLowerCase();
              if (candidateType && candidateType !== "jobposting") {
                return null;
              }

              const identifier = candidate.identifier;
              const identifierValue =
                typeof identifier === "object" && identifier && !Array.isArray(identifier)
                  ? toText((identifier as Record<string, unknown>).value)
                  : toText(identifier);
              const companyCandidate =
                typeof candidate.hiringOrganization === "object" &&
                candidate.hiringOrganization &&
                !Array.isArray(candidate.hiringOrganization)
                  ? (candidate.hiringOrganization as Record<string, unknown>)
                  : null;
              const directApply =
                Boolean(candidate.directApply === true) ||
                toText(candidate.applicantLocationRequirements).toLowerCase().includes("easy apply");
              const canonicalUrl = isAllowedInScopeUrl(
                toText(candidate.url) || toText(candidate.sameAs) || toText(candidate.mainEntityOfPage),
              );
              const location =
                locationValue(candidate.jobLocation) ||
                locationValue(candidate.applicantLocationRequirements) ||
                null;

              if (!canonicalUrl) {
                return null;
              }

              return {
                canonicalUrl,
                sourceJobId: identifierValue || null,
                title: toText(candidate.title),
                company:
                  toText(companyCandidate?.name) || toText(candidate.hiringOrganizationName) || null,
                location,
                description:
                  toText(candidate.description) ||
                  toText(candidate.responsibilities) ||
                  null,
                summary: toText(candidate.responsibilities) || null,
                postedAt: toText(candidate.datePosted) || null,
                postedAtText: toText(candidate.datePosted) || null,
                salaryText:
                  toText(candidate.baseSalary) ||
                  toText(candidate.salaryCurrency) ||
                  null,
                workMode: textArray(candidate.jobLocationType),
                applyPath: directApply ? "easy_apply" : "unknown",
                easyApplyEligible: directApply,
                keySkills: textArray(candidate.skills),
                responsibilities: textArray(candidate.responsibilities),
                minimumQualifications: textArray(candidate.qualifications),
                preferredQualifications: textArray(candidate.educationRequirements),
                seniority: toText(candidate.experienceRequirements) || null,
                employmentType: normalizeEmploymentType(candidate.employmentType),
                department: toText(candidate.industry) || null,
                team: null,
                employerWebsiteUrl: isAllowedInScopeUrl(toText(companyCandidate?.sameAs)),
                employerDomain: null,
                benefits: textArray(candidate.jobBenefits),
              };
            };

            const cardCandidates: SearchResultCardCandidate[] = [];
            const cardSelectors = [
              "article",
              "li",
              "[role='article']",
              "[data-job-id]",
              "[data-jobid]",
              "[data-job-id] *",
            ];
            const seenCardUrls = new Set<string>();
            for (const selector of cardSelectors) {
              for (const element of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
                if (cardCandidates.length >= 30) {
                  break;
                }
                const anchor =
                  element.matches("a[href]")
                    ? (element as HTMLAnchorElement)
                    : element.querySelector<HTMLAnchorElement>("a[href]");
                const canonicalUrl = isAllowedInScopeUrl(anchor?.getAttribute("href") ?? null);
                if (!canonicalUrl || seenCardUrls.has(canonicalUrl)) {
                  continue;
                }

                const lines = uniqueStrings(
                  toText(element.innerText)
                    .split(/\n+/g)
                    .map((line) => toText(line)),
                ).slice(0, 8);
                const headingText =
                  toText(
                    element.querySelector("h1, h2, h3, h4, [role='heading']")?.textContent ?? null,
                  ) || null;
                const anchorText = toText(anchor?.textContent ?? null);
                if (!anchorText && !headingText) {
                  continue;
                }

                seenCardUrls.add(canonicalUrl);
                cardCandidates.push({
                  canonicalUrl,
                  anchorText,
                  headingText,
                  lines,
                });
              }
            }

            const structuredJobs = uniqueStrings(
              Array.from(
                document.querySelectorAll<HTMLScriptElement>(
                  'script[type="application/ld+json"]',
                ),
                (script) => script.textContent ?? "",
              ),
            ).flatMap((scriptText) => {
              try {
                const payload = JSON.parse(scriptText) as unknown;
                const queue = Array.isArray(payload) ? [...payload] : [payload];
                const jobs: StructuredDataJobCandidate[] = [];
                while (queue.length > 0 && jobs.length < 20) {
                  const current = queue.shift();
                  if (!current || typeof current !== "object") {
                    continue;
                  }

                  if (Array.isArray(current)) {
                    queue.push(...current);
                    continue;
                  }

                  const record = current as Record<string, unknown>;
                  const normalized = normalizeStructuredJob(record);
                  if (normalized) {
                    jobs.push(normalized);
                  }

                  const graphValues = record["@graph"];
                  if (Array.isArray(graphValues)) {
                    queue.push(...graphValues);
                  }
                }
                return jobs;
              } catch {
                return [];
              }
            });

            return {
              structuredDataCandidates: structuredJobs.slice(0, 20),
              cardCandidates: cardCandidates.slice(0, 20),
            };
          },
          {
            allowedHostnames: context.config.navigationPolicy.allowedHostnames.map((hostname) => hostname.toLowerCase()),
            relevantUrlSubstrings,
            allowSubdomains: context.config.navigationPolicy.allowSubdomains === true,
          },
        );

        return { success: true, data: { pageType, pageUrl, pageText: truncatedPageText, pageTextLength: extractionTextLength, pageTextTruncated, readyForExtraction, maxJobs, linkedInJobUrlsFound: discoveredUrls.length, structuredDataCandidates: structuredCandidates.structuredDataCandidates, cardCandidates: structuredCandidates.cardCandidates, checks: { hasMinimumContent, hasNoLoadingIndicators, hasJobContent } } };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to extract jobs" };
      }
    },
  },
];
