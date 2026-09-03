import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  captureCompactDiscoveryObservation,
  compactDiscoveryInPageScan,
} from "./compact-discovery-observer";

const ROLE_PAGE_FIXTURE_URL =
  "https://wellfound.com/role/l/data-engineer/san-francisco";

function buildGroupedJobBoardFixtureHtml(): string {
  // Fixture mirrors captured dom-evidence: employer profile link on a card
  // wrapper, nested job title links without semantic listitem/article.
  return `<!doctype html>
<html>
  <body>
    <div class="my-4 w-full">
      <div class="mb-6 w-full rounded border border-gray-400 bg-white">
        <a href="https://wellfound.com/company/sigma-computing-2">Sigma Computing</a>
        <div class="mb-4 w-full px-4">
          <div class="min-h-[50px] rounded-2xl px-2 py-2 sm:flex">
            <div class="w-full pb-1 sm:pb-0">
              <div class="mb-1 flex items-start">
                <a
                  class="mr-2 text-sm font-semibold text-brand-burgandy hover:underline"
                  href="https://wellfound.com/jobs/4505800-data-engineer"
                >Data Engineer</a>
              </div>
            </div>
          </div>
          <div class="min-h-[50px] rounded-2xl px-2 py-2 sm:flex">
            <div class="w-full pb-1 sm:pb-0">
              <div class="mb-1 flex items-start">
                <a
                  class="mr-2 text-sm font-semibold text-brand-burgandy hover:underline"
                  href="https://wellfound.com/jobs/4475735-customer-deployment-engineer"
                >Customer Deployment Engineer</a>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="mb-2 flex flex-row border-b border-gray-400 py-3">
        <a href="https://wellfound.com/company/reflow-5">Reflow</a>
        <div class="ml-4 flex-1">
          <div class="mb-1">
            <a
              class="styles_component__UCLp3 styles_defaultLink__eZMqw mr-2 font-bold"
              href="https://wellfound.com/jobs/4634519-sales-development-representative"
            >Sales Development Representative</a>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

async function loadFixturePage(
  page: Page,
  pageUrl: string,
  html: string,
): Promise<void> {
  await page.route(pageUrl, (route) => {
    void route.fulfill({
      status: 200,
      contentType: "text/html",
      body: html,
    });
  });
  await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
}

describe("compactDiscoveryInPageScan live employer binding", () => {
  let browser: Browser | null = null;

  // Chromium launch and shutdown can exceed the default 10s hook budget when
  // several package suites share the host, so both hooks get explicit room.
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  }, 60_000);

  test("binds employer profile href + label on nested job anchors", async () => {
    expect(browser).not.toBeNull();
    const page = await browser!.newPage();
    await loadFixturePage(
      page,
      ROLE_PAGE_FIXTURE_URL,
      buildGroupedJobBoardFixtureHtml(),
    );

    const scanPayload = await page.evaluate(compactDiscoveryInPageScan, {
      maxContainers: 40,
      maxElements: 120,
      maxStructuredPostings: 20,
      maxLinesPerContainer: 12,
      maxLineChars: 180,
    });

    const groupedJob = scanPayload.elements.find(
      (element) =>
        element.href === "https://wellfound.com/jobs/4505800-data-engineer",
    );
    expect(groupedJob?.companyHref).toBe(
      "https://wellfound.com/company/sigma-computing-2",
    );
    expect(groupedJob?.companyLabel).toBe("Sigma Computing");

    const flatJob = scanPayload.elements.find(
      (element) =>
        element.href ===
        "https://wellfound.com/jobs/4634519-sales-development-representative",
    );
    expect(flatJob?.companyHref).toBe("https://wellfound.com/company/reflow-5");
    expect(flatJob?.companyLabel).toBe("Reflow");

    await page.close();
  });

  test("discovers JobPosting entries nested inside schema.org ItemList rows", async () => {
    expect(browser).not.toBeNull();
    const page = await browser!.newPage();
    const pageUrl = "https://careers.example.test/jobs";
    const html = `<!doctype html>
<html><head>
  <script type="application/ld+json">
    ${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          item: {
            "@type": "JobPosting",
            title: "Frontend Engineer",
            description: "Build accessible React and TypeScript products.",
            datePosted: "2026-08-27",
            employmentType: "FULL_TIME",
            hiringOrganization: {
              "@type": "Organization",
              name: "Northstar Labs",
            },
            jobLocation: {
              "@type": "Place",
              address: {
                "@type": "PostalAddress",
                addressLocality: "Austin",
                addressRegion: "TX",
                addressCountry: "US",
              },
            },
            url: "https://careers.example.test/jobs/frontend-engineer",
          },
        },
      ],
    })}
  </script>
</head><body><main><h1>Northstar Labs careers</h1></main></body></html>`;
    await loadFixturePage(page, pageUrl, html);

    const scanPayload = await page.evaluate(compactDiscoveryInPageScan, {
      maxContainers: 40,
      maxElements: 120,
      maxStructuredPostings: 20,
      maxLinesPerContainer: 12,
      maxLineChars: 180,
    });
    expect(scanPayload.structuredPostings).toHaveLength(1);

    const observation = await captureCompactDiscoveryObservation({
      page,
      targetId: "item-list-board",
      observationId: "obs-item-list-board",
      revision: 1,
      observedAt: "2026-08-27T12:00:00.000Z",
      options: { postingCandidatesMax: 10 },
    });

    expect(observation.kind).toBe("supported");
    if (observation.kind === "supported") {
      expect(observation.postingCandidates).toHaveLength(1);
      expect(observation.postingCandidates[0]).toMatchObject({
        title: "Frontend Engineer",
        company: "Northstar Labs",
        canonicalUrl: "https://careers.example.test/jobs/frontend-engineer",
      });
    }

    await page.close();
  });

  test("captureCompactDiscoveryObservation persists recovered employers end-to-end", async () => {
    expect(browser).not.toBeNull();
    const page = await browser!.newPage();
    await loadFixturePage(
      page,
      ROLE_PAGE_FIXTURE_URL,
      buildGroupedJobBoardFixtureHtml(),
    );
    await page.evaluate(() => {
      Object.defineProperty(document.body, "innerText", {
        configurable: true,
        get() {
          return "Data Engineer Customer Deployment Engineer Sales Development Representative";
        },
      });
    });

    const observation = await captureCompactDiscoveryObservation({
      page,
      targetId: "grouped-board-live-binding",
      observationId: "obs-grouped-board-live-binding",
      revision: 1,
      observedAt: "2026-08-27T12:00:00.000Z",
      options: { postingCandidatesMax: 10 },
    });

    if (observation.kind !== "supported") {
      await page.close();
      return;
    }

    expect(observation.kind).toBe("supported");

    const sigmaJob = observation.postingCandidates.find((posting) =>
      posting.canonicalUrl.includes("/jobs/4505800-data-engineer"),
    );
    expect(sigmaJob?.company).toBe("Sigma Computing");
    expect(sigmaJob?.company).not.toBe("Employer not stated");

    const reflowJob = observation.postingCandidates.find((posting) =>
      posting.canonicalUrl.includes(
        "/jobs/4634519-sales-development-representative",
      ),
    );
    expect(reflowJob?.company).toBe("Reflow");

    const employerNames = observation.postingCandidates.map(
      (posting) => posting.company,
    );
    expect(employerNames.every((name) => name !== "Employer not stated")).toBe(
      true,
    );

    await page.close();
  });

  test("drops bare /jobs hub rows from posting inventory", async () => {
    expect(browser).not.toBeNull();
    const page = await browser!.newPage();
    const html = `<!doctype html>
<html><body>
  <a href="https://wellfound.com/jobs">View all jobs</a>
  <a href="https://wellfound.com/jobs/4505800-data-engineer">Data Engineer</a>
  <a href="https://wellfound.com/company/sigma-computing-2">Sigma Computing</a>
</body></html>`;
    await loadFixturePage(page, ROLE_PAGE_FIXTURE_URL, html);
    await page.evaluate(() => {
      Object.defineProperty(document.body, "innerText", {
        configurable: true,
        get() {
          return "View all jobs Data Engineer Sigma Computing";
        },
      });
    });

    const observation = await captureCompactDiscoveryObservation({
      page,
      targetId: "utility-hub-filter",
      observationId: "obs-utility-hub-filter",
      revision: 1,
      observedAt: "2026-08-27T12:00:00.000Z",
      options: { postingCandidatesMax: 10 },
    });

    expect(observation.kind).toBe("supported");
    if (observation.kind !== "supported") {
      await page.close();
      return;
    }

    const canonicalUrls = observation.postingCandidates.map(
      (posting) => posting.canonicalUrl,
    );
    expect(canonicalUrls).not.toContain("https://wellfound.com/jobs");
    expect(
      canonicalUrls.some((url) => url.includes("/jobs/4505800-data-engineer")),
    ).toBe(true);

    await page.close();
  });
});
