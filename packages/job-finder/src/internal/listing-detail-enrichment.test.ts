import { describe, expect, it, vi } from "vitest";
import type {
  JobPosting,
  MatchAssessment,
  SavedJob,
} from "@unemployed/contracts";
import { createSavedJob } from "../workspace-service.test-fixtures";
import {
  applyListingDetailToJob,
  describeListingDetailEnrichment,
  enrichSavedJobListingDetails,
  jobNeedsListingDetail,
  type ListingHtmlFetcher,
} from "./listing-detail-enrichment";

const NOW = "2026-09-05T10:00:00.000Z";

function cardOnlyJob(overrides: Partial<SavedJob> = {}): SavedJob {
  return createSavedJob({
    id: "job_card",
    source: "target_site",
    sourceJobId: "4677969",
    discoveryMethod: "browser_agent",
    canonicalUrl: "https://jobs.example.test/4677969-senior-software-engineer",
    applicationUrl: null,
    title: "Senior Software Engineer",
    company: "jobs.example.test",
    location: "Location not stated",
    workMode: [],
    applyPath: "unknown",
    easyApplyEligible: false,
    postedAt: null,
    postedAtText: null,
    discoveredAt: "2026-09-05T09:58:00.000Z",
    firstSeenAt: "2026-09-05T09:58:00.000Z",
    lastSeenAt: "2026-09-05T09:58:00.000Z",
    lastVerifiedActiveAt: null,
    salaryText: null,
    summary: null,
    description: "Senior Software Engineer",
    keySkills: [],
    responsibilities: [],
    minimumQualifications: [],
    preferredQualifications: [],
    seniority: null,
    employmentType: null,
    department: null,
    team: null,
    employerWebsiteUrl: null,
    employerDomain: null,
    atsProvider: null,
    keywordSignals: [],
    benefits: [],
    status: "discovered",
    matchAssessment: { score: 48, reasons: [], gaps: [] },
    provenance: [],
    ...overrides,
  } as Parameters<typeof createSavedJob>[0]);
}

const RECORD_PAGE = `<script type="application/ld+json">{"@type":"JobPosting","title":"Senior Software Engineer","datePosted":"2026-08-30","employmentType":"FULL_TIME","hiringOrganization":{"name":"Garner Health"},"jobLocation":{"address":{"addressLocality":"New York","addressRegion":"NY","addressCountry":"US"}},"baseSalary":{"currency":"USD","value":{"minValue":180000,"maxValue":220000,"unitText":"YEAR"}},"description":"<p>Garner is building tools that make healthcare affordable, and this team owns the provider platform end to end.</p><h3>What you will do</h3><ul><li>Design and ship C# and .NET services for a behavioral-health platform.</li><li>Own MongoDB schema design and query tuning across provider and appointment workflows.</li><li>Build ASP.NET Core REST APIs and internal microservices.</li></ul><h3>Requirements</h3><ul><li>5+ years with .NET Core and REST APIs.</li><li>Production experience with cloud services on Azure or AWS.</li><li>Comfort with CI/CD automation and observability.</li></ul><p>We offer remote work across the United States.</p>"}</script>`;

function fakeFetcher(
  routes: Record<string, { status?: number; html: string } | Error>,
): ListingHtmlFetcher & { calls: string[] } {
  const calls: string[] = [];
  const fetcher: ListingHtmlFetcher = (url) => {
    calls.push(url);
    const route = routes[url];
    if (!route) {
      return Promise.resolve({ status: 404, html: "", finalUrl: url });
    }
    if (route instanceof Error) {
      return Promise.reject(route);
    }
    return Promise.resolve({
      status: route.status ?? 200,
      html: route.html,
      finalUrl: url,
    });
  };
  return Object.assign(fetcher, { calls });
}

const assess = vi.fn(
  (posting: JobPosting): MatchAssessment =>
    ({
      scorerVersion: 9,
      score: posting.description.length > 100 ? 82 : 48,
      dimensions: {},
      reasons: posting.description.length > 100 ? ["Requirements matched"] : [],
      gaps: [],
      recommendation: "review_before_applying",
      recommendationRationale: "test",
      contextFingerprint: "ctx",
      postingFingerprint: `post_${posting.description.length}`,
    }) as unknown as MatchAssessment,
);

describe("jobNeedsListingDetail", () => {
  it("reads only fetchable, un-enriched jobs that were not tried too recently", () => {
    expect(jobNeedsListingDetail(cardOnlyJob(), NOW)).toBe(true);
    expect(
      jobNeedsListingDetail(
        cardOnlyJob({ detailQuality: "detail_enriched" }),
        NOW,
      ),
    ).toBe(false);
    expect(
      jobNeedsListingDetail(
        cardOnlyJob({ canonicalUrl: "mailto:jobs@example.test" }),
        NOW,
      ),
    ).toBe(false);
    expect(
      jobNeedsListingDetail(
        cardOnlyJob({
          listingDetailFetch: {
            attemptedAt: "2026-09-05T09:30:00.000Z",
            outcome: "no_detail",
            method: null,
            detail: null,
          },
        }),
        NOW,
      ),
    ).toBe(false);
    // A failed read is worth another try after an hour, a read with no body
    // only after a day.
    expect(
      jobNeedsListingDetail(
        cardOnlyJob({
          listingDetailFetch: {
            attemptedAt: "2026-09-05T08:30:00.000Z",
            outcome: "fetch_failed",
            method: null,
            detail: null,
          },
        }),
        NOW,
      ),
    ).toBe(true);
  });
});

describe("enrichSavedJobListingDetails", () => {
  it("reads the page, fills the card's gaps, upgrades quality and re-scores", async () => {
    const job = cardOnlyJob();
    const fetchHtml = fakeFetcher({
      [job.canonicalUrl]: { html: RECORD_PAGE },
    });

    const result = await enrichSavedJobListingDetails({
      jobs: [job],
      fetchHtml,
      assess,
      now: () => NOW,
    });

    const next = result.jobs[0]!;
    expect(result.changedJobIds).toEqual([job.id]);
    expect(next.detailQuality).toBe("detail_enriched");
    expect(next.listingDetailFetch).toMatchObject({
      attemptedAt: NOW,
      outcome: "enriched",
      method: "json_ld",
    });
    // The body is the point of the read; the card's placeholder company and
    // location give way to what the page said, the pay is filled in, and the
    // summary is the opening paragraph rather than the whole body.
    expect(next.description).toContain("5+ years with .NET Core and REST APIs");
    expect(next.company).toBe("Garner Health");
    expect(next.location).toBe("New York, NY, US");
    expect(next.salaryText).toBe("USD 180,000 – 220,000 / year");
    expect(next.normalizedCompensation.minAnnualUsd).toBe(180000);
    expect(next.postedAt).toBe("2026-08-30T00:00:00.000Z");
    expect(next.employmentType).toBe("Full-Time");
    expect(next.workMode).toContain("remote");
    expect(next.summary).toMatch(/^Garner is building tools/u);
    expect(next.summary?.length ?? 0).toBeLessThan(430);
    expect(next.matchAssessment.score).toBe(82);
    expect(result.summary).toMatchObject({ attempted: 1, enriched: 1 });
  });

  it("keeps a real employer and location the card already carried", async () => {
    const job = cardOnlyJob({ company: "Garner", location: "Austin, TX" });
    const fetchHtml = fakeFetcher({
      [job.canonicalUrl]: { html: RECORD_PAGE },
    });

    const result = await enrichSavedJobListingDetails({
      jobs: [job],
      fetchHtml,
      assess,
      now: () => NOW,
    });

    expect(result.jobs[0]?.company).toBe("Garner");
    expect(result.jobs[0]?.location).toBe("Austin, TX");
  });

  it("records what happened when a page will not read, without failing the batch", async () => {
    const blocked = cardOnlyJob({
      id: "job_blocked",
      canonicalUrl: "https://jobs.example.test/blocked",
    });
    const missing = cardOnlyJob({
      id: "job_missing",
      canonicalUrl: "https://jobs.example.test/missing",
    });
    const thin = cardOnlyJob({
      id: "job_thin",
      canonicalUrl: "https://jobs.example.test/thin",
    });
    const broken = cardOnlyJob({
      id: "job_broken",
      canonicalUrl: "https://jobs.example.test/broken",
    });
    const fetchHtml = fakeFetcher({
      [blocked.canonicalUrl]: { status: 403, html: "" },
      [thin.canonicalUrl]: {
        html: "<html><body><p>Sign in to view.</p></body></html>",
      },
      [broken.canonicalUrl]: new Error("socket hang up"),
    });

    const result = await enrichSavedJobListingDetails({
      jobs: [blocked, missing, thin, broken],
      fetchHtml,
      assess,
      now: () => NOW,
    });

    const byId = new Map(result.jobs.map((job) => [job.id, job]));
    expect(byId.get("job_blocked")?.listingDetailFetch?.outcome).toBe(
      "blocked",
    );
    expect(byId.get("job_missing")?.listingDetailFetch?.outcome).toBe(
      "fetch_failed",
    );
    expect(byId.get("job_thin")?.listingDetailFetch?.outcome).toBe("no_detail");
    expect(byId.get("job_broken")?.listingDetailFetch).toMatchObject({
      outcome: "fetch_failed",
      detail: "socket hang up",
    });
    for (const job of result.jobs) {
      expect(job.detailQuality).toBe("card_only");
      expect(job.description).toBe("Senior Software Engineer");
    }
    expect(result.summary).toMatchObject({
      attempted: 4,
      blocked: 1,
      failed: 2,
      noDetail: 1,
      enriched: 0,
    });
    expect(describeListingDetailEnrichment(result.summary)).toBe(
      "Read 0 of 4 listing pages · 1 had no listing text · 1 wanted a sign-in · 2 could not be reached.",
    );
  });

  it("skips jobs that do not need a read and caps how many it reads", async () => {
    const enriched = cardOnlyJob({
      id: "job_done",
      detailQuality: "detail_enriched",
    });
    const first = cardOnlyJob({
      id: "job_1",
      canonicalUrl: "https://jobs.example.test/1",
    });
    const second = cardOnlyJob({
      id: "job_2",
      canonicalUrl: "https://jobs.example.test/2",
    });
    const fetchHtml = fakeFetcher({
      [first.canonicalUrl]: { html: RECORD_PAGE },
      [second.canonicalUrl]: { html: RECORD_PAGE },
    });

    const result = await enrichSavedJobListingDetails({
      jobs: [enriched, first, second],
      fetchHtml,
      assess,
      now: () => NOW,
      maxJobs: 1,
    });

    expect(fetchHtml.calls).toEqual([first.canonicalUrl]);
    expect(result.changedJobIds).toEqual(["job_1"]);
    expect(result.summary.skipped).toBe(2);
    expect(result.jobs.map((job) => job.id)).toEqual([
      "job_done",
      "job_1",
      "job_2",
    ]);
  });

  it("stops starting reads once the time budget is spent", async () => {
    const jobs = [1, 2, 3].map((index) =>
      cardOnlyJob({
        id: `job_${index}`,
        canonicalUrl: `https://jobs.example.test/${index}`,
      }),
    );
    let ticks = 0;
    const fetchHtml: ListingHtmlFetcher = async (url) => {
      ticks += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { status: 200, html: RECORD_PAGE, finalUrl: url };
    };

    const result = await enrichSavedJobListingDetails({
      jobs,
      fetchHtml,
      assess,
      now: () => NOW,
      concurrency: 1,
      timeBudgetMs: 20,
    });

    expect(ticks).toBe(1);
    expect(result.summary.attempted).toBe(1);
    expect(result.summary.skipped).toBe(2);
  });
});

describe("applyListingDetailToJob", () => {
  it("reports partial when the page text is thin but still better than the card", () => {
    const job = cardOnlyJob();
    const applied = applyListingDetailToJob({
      job,
      detail: {
        method: "page_text",
        title: null,
        company: null,
        location: null,
        description:
          "We are hiring an engineer to join a small platform team. You will own services, gather requirements with product, and ship weekly. Remote welcome across Europe.",
        salaryText: null,
        employmentType: null,
        postedAt: null,
        validThrough: null,
        workModeHints: ["remote"],
        directApplyUrl: null,
      },
      attemptedAt: NOW,
      assess,
    });

    expect(applied.outcome).toBe("partial");
    expect(applied.job.detailQuality).toBe("partial_detail");
    expect(applied.job.listingDetailFetch?.method).toBe("page_text");
    expect(applied.job.workMode).toEqual(["remote"]);
  });
});
