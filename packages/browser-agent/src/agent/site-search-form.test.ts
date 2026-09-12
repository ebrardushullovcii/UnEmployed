import { chromium, type Browser, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  buildSiteSearchQueries,
  buildSiteSearchUrl,
  detectSiteSearchForm,
  titlesLookUnrelatedToRoles,
} from "./site-search-form";

describe("site search queries", () => {
  test("sends each role, then the roles without seniority, then the shared domain word", () => {
    expect(
      buildSiteSearchQueries([
        "Senior Software Engineer",
        "Staff/Senior Software Engineer",
        "senior software engineer",
        "Senior Software Developer",
      ]),
    ).toEqual([
      "Senior Software Engineer",
      "Staff Software Engineer",
      "Senior Software Developer",
      "Software Engineer",
      "Software Developer",
      "Software",
    ]);
    // Roles sharing nothing beyond the noun stop at the stripped roles.
    expect(buildSiteSearchQueries(["Product Manager", "Data Analyst"])).toEqual(
      ["Product Manager", "Data Analyst"],
    );
    expect(buildSiteSearchQueries(["Senior Software Engineer"], 2)).toEqual([
      "Senior Software Engineer",
      "Software Engineer",
    ]);
  });

  test("builds the results URL the form would open, keeping hidden inputs", () => {
    expect(
      buildSiteSearchUrl(
        {
          actionUrl: "https://jobs.example.test/",
          queryParam: "q",
          hiddenParams: [["lang", "en"]],
          evidence: "name=q",
        },
        "Senior Software Engineer",
      ),
    ).toBe("https://jobs.example.test/?lang=en&q=Senior+Software+Engineer");
  });

  test("calls a feed unrelated when no card title shares a word with any role", () => {
    const roles = ["Senior Software Engineer"];
    expect(
      titlesLookUnrelatedToRoles(
        ["Punëtor për Shitje", "Kamarier", "Menaxher i Shitjes"],
        roles,
      ),
    ).toBe(true);
    expect(
      titlesLookUnrelatedToRoles(
        ["Kamarier", "Software Developer (Remote)"],
        roles,
      ),
    ).toBe(false);
    // Seniority words alone are not a relation.
    expect(titlesLookUnrelatedToRoles(["Senior Accountant"], roles)).toBe(true);
    expect(titlesLookUnrelatedToRoles([], roles)).toBe(false);
    // A front page of a hundred listings with two engineering titles among
    // them is still the unfiltered feed.
    const feed = [
      "Business Developer",
      "Integration Engineer",
      ...Array.from({ length: 18 }, (_, index) => `Kamarier ${index}`),
    ];
    expect(titlesLookUnrelatedToRoles(feed, roles)).toBe(true);
    expect(
      titlesLookUnrelatedToRoles(
        ["Software Engineer", "Backend Developer", "Kamarier", "Arkatare"],
        roles,
      ),
    ).toBe(false);
  });
});

describe("site search form detection (real Chromium)", () => {
  let browser: Browser | null = null;
  let page: Page | null = null;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
  });

  afterAll(async () => {
    await page?.close();
    await browser?.close();
  });

  test("reads a GET search form by its input name, placeholder and hidden params", async () => {
    if (!page) throw new Error("no page");
    await page.setContent(
      `<html><body>
        <form action="/subscribe" method="post"><input name="email" type="email" placeholder="Search updates"></form>
        <form action="https://jobs.example.test/" method="get">
          <input type="hidden" name="lang" value="sq">
          <input type="text" name="q" placeholder="Kërko">
          <button type="submit">Kërko</button>
        </form>
      </body></html>`,
      { waitUntil: "domcontentloaded" },
    );
    // setContent leaves the page on about:blank; the absolute action resolves
    // regardless.
    const form = await detectSiteSearchForm(page);

    expect(form).toMatchObject({
      actionUrl: "https://jobs.example.test/",
      queryParam: "q",
      hiddenParams: [["lang", "sq"]],
    });
    expect(form?.evidence).toContain("name=q");
    expect(buildSiteSearchUrl(form!, "Frontend Developer")).toBe(
      "https://jobs.example.test/?lang=sq&q=Frontend+Developer",
    );
  });

  test("returns null when the page offers no recognizable search", async () => {
    if (!page) throw new Error("no page");
    await page.setContent(
      `<html><body><form method="get" action="https://x.example.test/login"><input name="username"><input name="pin" type="text"></form></body></html>`,
      { waitUntil: "domcontentloaded" },
    );

    expect(await detectSiteSearchForm(page)).toBeNull();
  });
});
