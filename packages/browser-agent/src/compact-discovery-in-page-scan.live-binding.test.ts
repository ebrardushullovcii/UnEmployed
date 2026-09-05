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

  test("uses title links and same-card structured evidence instead of category links or ads", async () => {
    const page = await browser!.newPage();
    const pageUrl = "https://careers.example.test/list";
    await loadFixturePage(
      page,
      pageUrl,
      `<!doctype html><html><body><table>
      <tr><td><script type="application/ld+json">${JSON.stringify({
        "@type": "JobPosting",
        title: "QA Engineer",
        hiringOrganization: { name: "Example Labs" },
        description:
          "Build browser test automation with TypeScript and review application requirements.",
      })}</script><a href="/jobs/123-qa-engineer"><h2>QA Engineer</h2></a>
      <h3>Example Labs</h3></td><td><a aria-label="Remote Quality Assurance Jobs" href="/quality-assurance">Quality assurance</a></td></tr>
      <tr><td><a href="/jobs/456-data-engineer"><h2>Data Engineer</h2></a><p>Data Engineer VERIFIED</p><p>Data Works</p><p>Remote</p></td>
      <td><a aria-label="Remote Data Engineering Jobs" href="/data-engineering">Data Engineering</a></td></tr>
      <tr><td><a href="/insurance">Insurance Partner</a><a href="/insurance">Health coverage for remote workers</a><p>Ad</p></td></tr>
      </table></body></html>`,
    );
    const observation = await captureCompactDiscoveryObservation({
      page,
      targetId: "target_generic",
      observationId: "obs_generic",
      revision: 1,
      observedAt: "2026-09-04T22:00:00.000Z",
    });
    if (observation.kind !== "supported")
      throw new Error(observation.detail ?? "Unsupported fixture");
    expect(observation.postingCandidates).toHaveLength(2);
    expect(
      observation.postingCandidates.map((candidate) => candidate.canonicalUrl),
    ).toEqual([
      "https://careers.example.test/jobs/123-qa-engineer",
      "https://careers.example.test/jobs/456-data-engineer",
    ]);
    expect(observation.postingCandidates[0]).toMatchObject({
      company: "Example Labs",
      description:
        "Build browser test automation with TypeScript and review application requirements.",
    });
    expect(observation.postingCandidates[1]?.company).toBe("Data Works");
    await page.close();
  });

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

  test("reads a lone card on a results page once the shape was learned on a busier page", async () => {
    const page = await browser!.newPage();
    const card = (slug: string, title: string, city: string) =>
      `<div class="listing listing--premium"><a href="https://board.example.test/${slug}"><div class="logo"></div><div class="body"><div class="title">${title}</div><div class="city">${city}</div><div class="expires">19 days</div></div></a></div>`;
    const frontPage = `<!doctype html><html><head><meta charset="utf-8"></head><body><div class="wrap"><div class="header"><h1>Jobs</h1></div><div class="list">${card(
      "mero/kuzhinier",
      "Kuzhinier",
      "Fushë Kosovë",
    )}${card("tregu-group/arkatare", "Arkatare", "Prishtinë")}${card(
      "ls-global/senior-software-engineer",
      "Senior Software Engineer",
      "Prishtinë",
    )}${card("salt/hr-manager", "HR Manager", "Prishtinë")}</div></div></body></html>`;
    const resultsPage = `<!doctype html><html><head><meta charset="utf-8"></head><body><div class="wrap"><div class="header"><h1>Results</h1></div><div class="list">${card(
      "ls-global/senior-software-engineer",
      "Senior Software Engineer",
      "Prishtinë",
    )}</div></div></body></html>`;

    // Without memory, one block has no repetition to prove it is a card.
    await loadFixturePage(page, "https://board.example.test/?q=x", resultsPage);
    const cold = await captureCompactDiscoveryObservation({
      page,
      targetId: "card-shape-cold",
      observationId: "obs-card-shape-cold",
      revision: 1,
      observedAt: "2026-09-05T06:00:00.000Z",
    });
    expect(cold.kind === "supported" ? cold.postingCandidates.length : 0).toBe(
      0,
    );

    const cardShapeMemory = new Set<string>();
    await loadFixturePage(page, "https://board.example.test/", frontPage);
    const front = await captureCompactDiscoveryObservation({
      page,
      targetId: "card-shape-front",
      observationId: "obs-card-shape-front",
      revision: 1,
      observedAt: "2026-09-05T06:00:01.000Z",
      cardShapeMemory,
    });
    expect(front.kind).toBe("supported");
    if (front.kind === "supported") {
      expect(front.postingCandidates).toHaveLength(4);
      expect(front.postingCandidates[2]).toMatchObject({
        title: "Senior Software Engineer",
        company: "Ls Global",
        location: "Prishtinë",
      });
    }
    expect(cardShapeMemory.size).toBe(1);

    await loadFixturePage(page, "https://board.example.test/?q=x", resultsPage);
    const warm = await captureCompactDiscoveryObservation({
      page,
      targetId: "card-shape-warm",
      observationId: "obs-card-shape-warm",
      revision: 2,
      observedAt: "2026-09-05T06:00:02.000Z",
      cardShapeMemory,
    });
    expect(warm.kind).toBe("supported");
    if (warm.kind === "supported") {
      expect(warm.postingCandidates).toHaveLength(1);
      expect(warm.postingCandidates[0]).toMatchObject({
        title: "Senior Software Engineer",
        company: "Ls Global",
        canonicalUrl:
          "https://board.example.test/ls-global/senior-software-engineer",
      });
    }
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
