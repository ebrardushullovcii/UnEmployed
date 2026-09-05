import { describe, expect, it } from "vitest";
import {
  extractListingDetailFromHtml,
  htmlToPlainText,
} from "./listing-detail-extraction";

const JOB_POSTING_PAGE = `<!doctype html>
<html><head>
<title>Senior Software Engineer at Garner Health</title>
<meta property="og:title" content="Senior Software Engineer - Garner Health">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "JobPosting",
  "title": "Senior Software Engineer",
  "datePosted": "2026-08-30",
  "validThrough": "2026-10-30T00:00:00Z",
  "employmentType": "FULL_TIME",
  "hiringOrganization": { "@type": "Organization", "name": "Garner Health" },
  "jobLocation": { "@type": "Place", "address": { "@type": "PostalAddress", "addressLocality": "New York", "addressRegion": "NY", "addressCountry": "US" } },
  "jobLocationType": "TELECOMMUTE",
  "baseSalary": { "@type": "MonetaryAmount", "currency": "USD", "value": { "@type": "QuantitativeValue", "minValue": 180000, "maxValue": 220000, "unitText": "YEAR" } },
  "description": "<p>Garner is building the tools that make healthcare affordable.</p><h3>What you&rsquo;ll do</h3><ul><li>Design and ship C# and .NET services.</li><li>Own MongoDB schema design &amp; query tuning.</li></ul><p>Requirements: 5+ years with .NET Core, REST APIs, and cloud services on Azure or AWS.</p>"
}
</script>
</head><body><nav>Home Jobs</nav><main><h1>Senior Software Engineer</h1></main></body></html>`;

describe("extractListingDetailFromHtml", () => {
  it("reads a JobPosting record: body as readable text, pay, place, dates, remote", () => {
    const detail = extractListingDetailFromHtml({
      html: JOB_POSTING_PAGE,
      url: "https://jobs.example.test/4677969",
      expectedTitle: "Senior Software Engineer",
    });

    expect(detail?.method).toBe("json_ld");
    expect(detail?.title).toBe("Senior Software Engineer");
    expect(detail?.company).toBe("Garner Health");
    expect(detail?.location).toBe("New York, NY, US");
    expect(detail?.workModeHints).toContain("remote");
    expect(detail?.salaryText).toBe("USD 180,000 – 220,000 / year");
    expect(detail?.employmentType).toBe("Full-Time");
    expect(detail?.postedAt).toBe("2026-08-30T00:00:00.000Z");
    expect(detail?.validThrough).toBe("2026-10-30T00:00:00.000Z");
    // Entities decoded, headings and list items on their own lines.
    expect(detail?.description).toContain("What you’ll do");
    expect(detail?.description).toContain(
      "• Design and ship C# and .NET services.",
    );
    expect(detail?.description).toContain(
      "• Own MongoDB schema design & query tuning.",
    );
    expect(detail?.description).toContain(
      "Requirements: 5+ years with .NET Core",
    );
    expect(detail?.description).not.toMatch(/<[a-z]/iu);
  });

  it("walks an @graph and picks the record whose title matches the card", () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
      {"@type":"Organization","name":"Acme"},
      {"@type":"JobPosting","title":"Staff Designer","description":"<p>Design things for a long time with many words about brand and marketing and UI so this is the longer record.</p>","hiringOrganization":{"name":"Acme"}},
      {"@type":["JobPosting","Thing"],"title":"Backend Engineer","description":"<p>Build APIs.</p>","hiringOrganization":{"name":"Acme"}}
    ]}</script>`;

    const detail = extractListingDetailFromHtml({
      html,
      url: "https://acme.example.test/jobs/2",
      expectedTitle: "Backend Engineer",
    });

    expect(detail?.title).toBe("Backend Engineer");
    expect(detail?.description).toBe("Build APIs.");
  });

  it("tolerates a trailing comma and a second, unrelated ld+json block", () => {
    const html = `<script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[]}</script>
      <script type='application/ld+json'>{"@type":"JobPosting","title":"Data Engineer","description":"Own pipelines.","hiringOrganization":{"name":"Pipes"},}</script>`;

    const detail = extractListingDetailFromHtml({
      html,
      url: "https://pipes.example.test/jobs/1",
    });

    expect(detail?.method).toBe("json_ld");
    expect(detail?.company).toBe("Pipes");
    expect(detail?.description).toBe("Own pipelines.");
  });

  it("drops a broader place already contained in a more specific one", () => {
    const html = `<script type="application/ld+json">{"@type":"JobPosting","title":"SE","description":"Do the thing well.","jobLocation":[{"address":{"addressLocality":"Austin","addressRegion":"Texas","addressCountry":"United States"}},{"address":{"addressCountry":"United States"}}]}</script>`;

    expect(
      extractListingDetailFromHtml({ html, url: "https://x.example.test/3" })
        ?.location,
    ).toBe("Austin, Texas, United States");
  });

  it("labels a remote-only posting by its applicant regions when no place is given", () => {
    const html = `<script type="application/ld+json">{"@type":"JobPosting","title":"SRE","description":"Keep it up.","jobLocationType":"TELECOMMUTE","applicantLocationRequirements":[{"@type":"Country","name":"United States"},{"@type":"Country","name":"Canada"}]}</script>`;

    const detail = extractListingDetailFromHtml({
      html,
      url: "https://x.example.test/1",
    });

    expect(detail?.location).toBe("Remote (United States, Canada)");
    expect(detail?.workModeHints).toEqual(["remote"]);
  });

  it("falls back to the page's main text when no record is published", () => {
    const body = Array.from(
      { length: 40 },
      (_, index) =>
        `<p>Paragraph ${index}: you will own services and work with the team on requirements and delivery.</p>`,
    ).join("");
    const html = `<html><head><title>Platform Engineer | Northwind</title></head><body><header>Menu</header><main><h1>Platform Engineer</h1>${body}<h2>Requirements</h2><ul><li>Five years of experience.</li></ul></main><footer>© Northwind</footer></body></html>`;

    const detail = extractListingDetailFromHtml({
      html,
      url: "https://northwind.example.test/jobs/9",
      expectedTitle: "Platform Engineer",
    });

    expect(detail?.method).toBe("page_text");
    expect(detail?.title).toBe("Platform Engineer | Northwind");
    expect(detail?.description).toContain("• Five years of experience.");
    expect(detail?.description).not.toContain("Menu");
    expect(detail?.description).not.toContain("© Northwind");
  });

  it("returns null for a thin page rather than inventing a body", () => {
    const html = `<html><body><main><h1>Job</h1><p>Sign in to view this listing.</p></main></body></html>`;

    expect(
      extractListingDetailFromHtml({ html, url: "https://x.example.test/2" }),
    ).toBeNull();
  });
});

describe("htmlToPlainText", () => {
  it("keeps paragraph rhythm and bullets, drops tags and scripts", () => {
    expect(
      htmlToPlainText(
        "<div><p>One</p><script>bad()</script><ul><li>A</li><li>B &amp; C</li></ul><p>Two<br>lines</p></div>",
      ),
    ).toBe("One\n\n• A\n\n• B & C\n\nTwo\nlines");
  });
});
