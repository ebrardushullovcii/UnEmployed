import { describe, expect, test, vi } from "vitest";
import { createJobFinderAiClientFromEnvironment } from "./index";
import {
  inferCompanyFromCanonicalUrl,
  normalizeCompositeTitle,
} from "./deterministic/job-extraction";
import { createEnvironment, mockJsonFetch } from "./test-fixtures";

describe("normalizeCompositeTitle", () => {
  test("strips posted-at suffixes across supported languages", () => {
    expect(
      normalizeCompositeTitle(
        "Senior Product Designer Remote Posted 3 days ago",
      ),
    ).toMatchObject({
      title: "Senior Product Designer",
      location: "Remote",
      postedAtText: "Posted 3 days ago",
    });
    expect(
      normalizeCompositeTitle("Backend Engineer Prishtine 11 ditë"),
    ).toMatchObject({
      title: "Backend Engineer",
      location: "Prishtine",
      postedAtText: "11 ditë",
    });
    expect(
      normalizeCompositeTitle("Backend Engineer Prishtine 2 javë"),
    ).toMatchObject({
      title: "Backend Engineer",
      location: "Prishtine",
      postedAtText: "2 javë",
    });
    expect(
      normalizeCompositeTitle("Backend Engineer Prishtine 5 orë"),
    ).toMatchObject({
      title: "Backend Engineer",
      location: "Prishtine",
      postedAtText: "5 orë",
    });
  });

  test("does not strip bare Albanian week words without a numeric prefix", () => {
    expect(normalizeCompositeTitle("Marketing Specialist jave")).toMatchObject({
      title: "Marketing Specialist jave",
      location: null,
      postedAtText: null,
    });
  });

  test("does not treat a trailing role token with punctuation as a location", () => {
    expect(normalizeCompositeTitle("Senior Software Engineer.")).toMatchObject({
      title: "Senior Software Engineer.",
      location: null,
      postedAtText: null,
    });
  });

  test("extracts location hints like remote or hybrid", () => {
    expect(normalizeCompositeTitle("Staff Data Engineer Remote")).toMatchObject(
      {
        title: "Staff Data Engineer",
        location: "Remote",
        postedAtText: null,
      },
    );
    expect(normalizeCompositeTitle("Product Designer Hybrid")).toMatchObject({
      title: "Product Designer",
      location: "Hybrid",
      postedAtText: null,
    });
  });

  test("prefers multi-token trailing locations over single-token suffixes", () => {
    expect(normalizeCompositeTitle("Backend Engineer New York")).toMatchObject({
      title: "Backend Engineer",
      location: "New York",
    });
    expect(
      normalizeCompositeTitle("Product Designer San Francisco"),
    ).toMatchObject({
      title: "Product Designer",
      location: "San Francisco",
    });
    expect(
      normalizeCompositeTitle("Support Manager North Carolina"),
    ).toMatchObject({
      title: "Support Manager",
      location: "North Carolina",
    });
    expect(normalizeCompositeTitle("Data Analyst United States")).toMatchObject(
      {
        title: "Data Analyst",
        location: "United States",
      },
    );
    expect(
      normalizeCompositeTitle("Solutions Engineer Hong Kong"),
    ).toMatchObject({
      title: "Solutions Engineer",
      location: "Hong Kong",
    });
  });

  test("does not treat trailing role phrases as locations", () => {
    expect(normalizeCompositeTitle("Manager Field Operations")).toMatchObject({
      title: "Manager Field Operations",
      location: null,
    });
  });
});

describe("inferCompanyFromCanonicalUrl", () => {
  test("returns the first non-generic path segment as the company", () => {
    expect(inferCompanyFromCanonicalUrl("https://example.com/acme/dev")).toBe(
      "Acme",
    );
    expect(inferCompanyFromCanonicalUrl("https://example.com/acme/jobs")).toBe(
      "Acme",
    );
    expect(
      inferCompanyFromCanonicalUrl(
        "https://example.com/jobs/acme/frontend-engineer",
      ),
    ).toBe("Acme");
  });

  test("treats pune as a generic job path segment", () => {
    expect(
      inferCompanyFromCanonicalUrl(
        "https://example.com/pune/frontend-engineer",
      ),
    ).toBeNull();
  });
});

describe("job extraction with openai-compatible client", () => {
  test("preserves extracted apply metadata when the model returns it", async () => {
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              jobs: [
                {
                  title: "Frontend Engineer",
                  company: "Acme",
                  location: "Remote",
                  canonicalUrl: "https://jobs.example.com/frontend-engineer",
                  sourceJobId: "job_123",
                  description: "Build product experiences.",
                  summary: "Build product experiences.",
                  applyPath: "easy_apply",
                  easyApplyEligible: true,
                  workMode: ["remote"],
                  keySkills: ["React", "TypeScript"],
                },
              ],
            }),
          },
        },
      ],
    });

    try {
      const client =
        createJobFinderAiClientFromEnvironment(createEnvironment());

      const jobs = await client.extractJobsFromPage({
        pageText: "Frontend Engineer role at Acme",
        pageUrl: "https://jobs.example.com/search",
        pageType: "search_results",
        maxJobs: 5,
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        applyPath: "easy_apply",
        easyApplyEligible: true,
        summary: "Build product experiences.",
        postedAt: null,
        postedAtText: null,
        responsibilities: [],
        minimumQualifications: [],
        preferredQualifications: [],
      });
    } finally {
      restoreFetch();
    }
  });

  test("normalizes scalar work mode and key skills before validating extracted jobs", async () => {
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              jobs: [
                {
                  title: "Frontend Engineer",
                  company: "Acme",
                  location: "Remote",
                  canonicalUrl: "https://jobs.example.com/frontend-engineer",
                  sourceJobId: "job_456",
                  description: "Build product experiences.",
                  summary: "Build product experiences.",
                  applyPath: "external_redirect",
                  easyApplyEligible: false,
                  workMode: "remote",
                  keySkills: "React",
                },
              ],
            }),
          },
        },
      ],
    });

    try {
      const client =
        createJobFinderAiClientFromEnvironment(createEnvironment());

      const jobs = await client.extractJobsFromPage({
        pageText: "Frontend Engineer role at Acme",
        pageUrl: "https://jobs.example.com/search",
        pageType: "search_results",
        maxJobs: 5,
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        workMode: ["remote"],
        keySkills: ["React"],
        summary: "Build product experiences.",
      });
    } finally {
      restoreFetch();
    }
  });

  test("preserves richer extracted job fields and avoids synthetic posted dates", async () => {
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              jobs: [
                {
                  title: "Senior Frontend Engineer",
                  company: "Acme",
                  location: "Remote",
                  canonicalUrl: "https://jobs.example.com/frontend-engineer",
                  sourceJobId: "job_rich",
                  description:
                    "Build product experiences for the core platform.",
                  summary: "Lead platform UI work.",
                  postedAtText: "Posted 3 days ago",
                  responsibilities: [
                    "Own the design-system frontend architecture",
                  ],
                  minimumQualifications: ["5+ years of React experience"],
                  preferredQualifications: ["Electron experience"],
                  seniority: "Senior",
                  employmentType: "Full-time",
                  department: "Engineering",
                  team: "Platform UI",
                  employerWebsiteUrl: "https://acme.example.com/careers",
                  benefits: ["Remote-first culture"],
                  applyPath: "easy_apply",
                  easyApplyEligible: true,
                  workMode: ["remote"],
                  keySkills: ["React", "Electron"],
                },
              ],
            }),
          },
        },
      ],
    });

    try {
      const client =
        createJobFinderAiClientFromEnvironment(createEnvironment());

      const jobs = await client.extractJobsFromPage({
        pageText: "Senior Frontend Engineer role at Acme",
        pageUrl: "https://jobs.example.com/search",
        pageType: "search_results",
        maxJobs: 5,
      });

      expect(jobs[0]).toMatchObject({
        title: "Senior Frontend Engineer",
        postedAt: null,
        postedAtText: "Posted 3 days ago",
        responsibilities: ["Own the design-system frontend architecture"],
        minimumQualifications: ["5+ years of React experience"],
        preferredQualifications: ["Electron experience"],
        seniority: "Senior",
        employmentType: "Full-time",
        department: "Engineering",
        team: "Platform UI",
        employerWebsiteUrl: "https://acme.example.com/careers",
        employerDomain: "acme.example.com",
        benefits: ["Remote-first culture"],
      });
    } finally {
      restoreFetch();
    }
  });

  test("recovers sparse weak-target search results by deriving company from same-host urls and preserving visible snippets", async () => {
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              jobs: [
                {
                  title:
                    "Category Manager, Fashion, Sports & Outdoor (E-Commerce) Prishtinë 11 ditë",
                  company: "",
                  location: "",
                  canonicalUrl:
                    "https://kosovajob.com/shopaz/category-manager-fashion-sports-outdoor-e-commerce",
                  description: "Visible homepage job snippet.",
                  applyPath: "unknown",
                  easyApplyEligible: false,
                  workMode: [],
                  keySkills: [],
                },
              ],
            }),
          },
        },
      ],
    });

    try {
      const client =
        createJobFinderAiClientFromEnvironment(createEnvironment());

      const jobs = await client.extractJobsFromPage({
        pageText: "Homepage job listings on Kosovajob",
        pageUrl: "https://kosovajob.com/",
        pageType: "search_results",
        maxJobs: 5,
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        sourceJobId:
          "kosovajob_com_shopaz_category_manager_fashion_sports_outdoor_e_commerce",
        canonicalUrl:
          "https://kosovajob.com/shopaz/category-manager-fashion-sports-outdoor-e-commerce",
        title: "Category Manager, Fashion, Sports & Outdoor (E-Commerce)",
        company: "Shopaz",
        location: "Prishtinë",
        postedAt: null,
        postedAtText: "11 ditë",
        description: "Visible homepage job snippet.",
      });
    } finally {
      restoreFetch();
    }
  });

  test("skips locale-style path prefixes before inferring a company from the canonical url", async () => {
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              jobs: [
                {
                  title: "Product Designer",
                  company: "",
                  location: "Remote",
                  canonicalUrl:
                    "https://jobs.example.com/en/acme/product-designer",
                  description: "Design product experiences.",
                  applyPath: "unknown",
                  easyApplyEligible: false,
                  workMode: [],
                  keySkills: [],
                },
              ],
            }),
          },
        },
      ],
    });

    try {
      const client =
        createJobFinderAiClientFromEnvironment(createEnvironment());

      const jobs = await client.extractJobsFromPage({
        pageText: "Product Designer role",
        pageUrl: "https://jobs.example.com/search",
        pageType: "search_results",
        maxJobs: 5,
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        company: "Acme",
      });
    } finally {
      restoreFetch();
    }
  });

  test("extracts a trailing location even when preceding tokens are role-like", async () => {
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              jobs: [
                {
                  title: "Platform Engineer Architect Prishtine",
                  company: "Acme",
                  location: "",
                  canonicalUrl:
                    "https://jobs.example.com/platform-engineer-architect-prishtine",
                  description: "Design platform systems.",
                  applyPath: "unknown",
                  easyApplyEligible: false,
                  workMode: [],
                  keySkills: [],
                },
              ],
            }),
          },
        },
      ],
    });

    try {
      const client =
        createJobFinderAiClientFromEnvironment(createEnvironment());

      const jobs = await client.extractJobsFromPage({
        pageText: "Platform Engineer Architect role",
        pageUrl: "https://jobs.example.com/search",
        pageType: "search_results",
        maxJobs: 5,
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        title: "Platform Engineer Architect",
        location: "Prishtine",
      });
    } finally {
      restoreFetch();
    }
  });

  test("uses normalized title and inferred company in search-result description fallback", async () => {
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              jobs: [
                {
                  title:
                    "Category Manager, Fashion, Sports & Outdoor (E-Commerce) Prishtinë 11 ditë",
                  company: "",
                  location: "",
                  canonicalUrl:
                    "https://kosovajob.com/shopaz/category-manager-fashion-sports-outdoor-e-commerce",
                  description: "",
                  summary: "",
                  applyPath: "unknown",
                  easyApplyEligible: false,
                  workMode: [],
                  keySkills: [],
                },
              ],
            }),
          },
        },
      ],
    });

    try {
      const client =
        createJobFinderAiClientFromEnvironment(createEnvironment());

      const jobs = await client.extractJobsFromPage({
        pageText: "Homepage job listings on Kosovajob",
        pageUrl: "https://kosovajob.com/",
        pageType: "search_results",
        maxJobs: 5,
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        title: "Category Manager, Fashion, Sports & Outdoor (E-Commerce)",
        company: "Shopaz",
        location: "Prishtinë",
        postedAtText: "11 ditë",
        description:
          "Category Manager, Fashion, Sports & Outdoor (E-Commerce) opportunity at Shopaz",
      });
    } finally {
      restoreFetch();
    }
  });

  test("limits job-detail extraction results to one job", async () => {
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              jobs: [
                {
                  title: "Frontend Engineer",
                  company: "Acme",
                  location: "Remote",
                  canonicalUrl: "https://jobs.example.com/frontend-engineer",
                  sourceJobId: "job_111",
                  description: "Build product experiences.",
                  applyPath: "easy_apply",
                  easyApplyEligible: true,
                  workMode: ["remote"],
                  keySkills: ["React"],
                },
                {
                  title: "Second Listing",
                  company: "Acme",
                  location: "Remote",
                  canonicalUrl: "https://jobs.example.com/frontend-engineer-2",
                  sourceJobId: "job_222",
                  description: "Should be ignored on detail pages.",
                  applyPath: "external_redirect",
                  easyApplyEligible: false,
                  workMode: ["remote"],
                  keySkills: ["TypeScript"],
                },
              ],
            }),
          },
        },
      ],
    });

    try {
      const client =
        createJobFinderAiClientFromEnvironment(createEnvironment());

      const jobs = await client.extractJobsFromPage({
        pageText: "Frontend Engineer role at Acme",
        pageUrl: "https://jobs.example.com/frontend-engineer",
        pageType: "job_detail",
        maxJobs: 5,
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0]?.sourceJobId).toBe("job_111");
    } finally {
      restoreFetch();
    }
  });

  test("falls back when extracted jobs payload omits the top-level jobs array", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({ invalid: true }),
          },
        },
      ],
    });

    try {
      const client =
        createJobFinderAiClientFromEnvironment(createEnvironment());

      const jobs = await client.extractJobsFromPage({
        pageText: "Frontend Engineer role at Acme",
        pageUrl: "https://jobs.example.com/search",
        pageType: "search_results",
        maxJobs: 5,
      });

      expect(jobs).toEqual([]);
      expect(errorSpy).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "[AI Provider] extractJobsFromPage failed; falling back to deterministic client",
        ),
      );
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Expected a top-level jobs array"),
      );
    } finally {
      restoreFetch();
      errorSpy.mockRestore();
    }
  });

  test("uses summary fallback for description on search-results pages when description is empty", async () => {
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              jobs: [
                {
                  title: "Frontend Engineer",
                  company: "Acme",
                  location: "Remote",
                  canonicalUrl: "https://jobs.example.com/frontend-engineer",
                  sourceJobId: "job_summary_fallback",
                  description: "",
                  summary:
                    "Build product experiences from the search results snippet.",
                  applyPath: "external_redirect",
                  easyApplyEligible: false,
                  workMode: ["remote"],
                  keySkills: ["React"],
                },
              ],
            }),
          },
        },
      ],
    });

    try {
      const client =
        createJobFinderAiClientFromEnvironment(createEnvironment());

      const jobs = await client.extractJobsFromPage({
        pageText:
          "Frontend Engineer role at Acme with a visible summary snippet",
        pageUrl: "https://jobs.example.com/search",
        pageType: "search_results",
        maxJobs: 5,
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0]?.description).toBe(
        "Build product experiences from the search results snippet.",
      );
      expect(jobs[0]?.summary).toBe(
        "Build product experiences from the search results snippet.",
      );
    } finally {
      restoreFetch();
    }
  });

  test("uses lighter request limits for search-results extraction to reduce first-pass stalls", async () => {
    const originalFetch = globalThis.fetch;
    let capturedBody: { messages?: Array<{ content: string }> } | null = null;

    globalThis.fetch = ((_, init) => {
      const requestBody = typeof init?.body === "string" ? init.body : "{}";
      capturedBody = JSON.parse(requestBody) as {
        messages?: Array<{ content: string }>;
      };

      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({ jobs: [] }),
                },
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );
    }) as typeof fetch;

    try {
      const client =
        createJobFinderAiClientFromEnvironment(createEnvironment());

      await client.extractJobsFromPage({
        pageText: "x".repeat(15000),
        pageUrl: "https://jobs.example.com/search",
        pageType: "search_results",
        maxJobs: 20,
      });

      expect(capturedBody).not.toBeNull();
      if (!capturedBody) {
        throw new Error("Expected the extraction request body to be captured.");
      }
      // TypeScript needs explicit type annotation after null check due to control flow analysis
      const requestBody: { messages?: Array<{ content: string }> } =
        capturedBody;
      const messages = requestBody.messages ?? [];
      expect(messages[0]?.content).toContain("Return at most 4 jobs.");
      expect(messages[0]?.content).toContain(
        "If only a short search-results snippet is visible",
      );
      const userPayload = JSON.parse(messages[1]?.content ?? "{}") as {
        pageText?: string;
      };
      expect(userPayload.pageText?.length ?? 0).toBeLessThanOrEqual(8000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("reports search-results extraction timeouts clearly before falling back", async () => {
    vi.useFakeTimers();
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const originalFetch = globalThis.fetch;

    globalThis.fetch = ((_, init) =>
      new Promise((_, reject) => {
        const signal = init?.signal as AbortSignal | undefined;

        if (signal?.aborted) {
          reject(new DOMException("This operation was aborted", "AbortError"));
          return;
        }

        signal?.addEventListener(
          "abort",
          () => {
            reject(
              new DOMException("This operation was aborted", "AbortError"),
            );
          },
          { once: true },
        );
      })) as typeof fetch;

    try {
      const client =
        createJobFinderAiClientFromEnvironment(createEnvironment());
      const extractionPromise = client.extractJobsFromPage({
        pageText: "Frontend Engineer role at Acme",
        pageUrl: "https://jobs.example.com/search",
        pageType: "search_results",
        maxJobs: 5,
      });

      await vi.advanceTimersByTimeAsync(35000);

      await expect(extractionPromise).resolves.toEqual([]);
      expect(errorSpy).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "[AI Provider] extractJobsFromPage failed; falling back",
        ),
      );
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Model request timed out"),
      );
    } finally {
      globalThis.fetch = originalFetch;
      errorSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
