import { describe, expect, test } from "vitest";

import {
  buildJobIdentityAliases,
  createJobIdentityIndex,
  normalizeJobIdentityUrl,
  type JobIdentityInput,
} from "./job-identity";

function identity(overrides: Partial<JobIdentityInput> = {}): JobIdentityInput {
  return {
    source: "target_site",
    sourceJobId: "5112809008",
    canonicalUrl:
      "https://www.linkedin.com/jobs/view/senior-engineer-5112809008",
    applicationUrl:
      "https://job-boards.greenhouse.io/acme/jobs/5112809008?gh_src=linkedin",
    providerKey: null,
    providerBoardToken: null,
    providerIdentifier: null,
    title: "Senior Software Engineer",
    company: "Acme",
    location: "Remote - United States",
    postedAt: "2026-08-08T12:30:00.000Z",
    postedAtText: "8 Aug 2026",
    ...overrides,
  };
}

describe("job identity", () => {
  test("matches an aggregator listing to its ATS listing through the employer application URL", () => {
    const aggregator = identity();
    const index = createJobIdentityIndex([aggregator], (value) => value);

    const match = index.find(
      identity({
        sourceJobId: "greenhouse_5112809008",
        canonicalUrl: "https://job-boards.greenhouse.io/acme/jobs/5112809008",
        applicationUrl:
          "https://job-boards.greenhouse.io/acme/jobs/5112809008?utm_source=direct",
        providerKey: "greenhouse",
        providerBoardToken: "acme",
        providerIdentifier: "acme",
      }),
    );

    expect(match).toBe(aggregator);
  });

  test("normalizes only non-identity URL decoration", () => {
    expect(
      normalizeJobIdentityUrl(
        "https://Jobs.Example.com/roles/123/?utm_source=board&ref=feed&department=eng#apply",
      ),
    ).toBe("https://jobs.example.com/roles/123?department=eng");
  });

  test("keeps corroborated facts possible and never auto-merges them alone", () => {
    const existing = identity();
    const index = createJobIdentityIndex([existing], (value) => value);
    const candidate = identity({
      sourceJobId: "another-opening",
      canonicalUrl: "https://careers.acme.test/jobs/another-opening",
      applicationUrl: "https://careers.acme.test/jobs/another-opening/apply",
    });

    expect(index.find(candidate)).toBeNull();
    expect(index.resolve(candidate)).toMatchObject({
      status: "possible",
      candidates: [existing],
    });
  });

  test("does not merge a colliding generic source ID across companies and hosts", () => {
    const existing = identity({
      sourceJobId: "123",
      canonicalUrl: "https://jobs.alpha.test/roles/123",
      applicationUrl: null,
      company: "Alpha",
    });
    const index = createJobIdentityIndex([existing], (value) => value);

    expect(
      index.find(
        identity({
          sourceJobId: "123",
          canonicalUrl: "https://jobs.beta.test/roles/123",
          applicationUrl: null,
          company: "Beta",
        }),
      ),
    ).toBeNull();
  });

  test("rejects conflicting provider-ID and URL evidence", () => {
    const providerMatch = identity({
      providerKey: "greenhouse",
      providerBoardToken: "acme",
      providerIdentifier: "acme",
    });
    const urlMatch = identity({
      sourceJobId: "different-job",
      canonicalUrl: "https://jobs.example.test/roles/different-job",
      applicationUrl: "https://jobs.example.test/roles/different-job/apply",
    });
    const index = createJobIdentityIndex(
      [providerMatch, urlMatch],
      (value) => value,
    );

    expect(
      index.resolve(
        identity({
          providerKey: "greenhouse",
          providerBoardToken: "acme",
          providerIdentifier: "acme",
          applicationUrl: urlMatch.applicationUrl ?? null,
          canonicalUrl: urlMatch.canonicalUrl,
        }),
      ).status,
    ).toBe("conflict");
  });

  test("uses exact facts only to disambiguate colliding strong IDs", () => {
    const first = identity({
      canonicalUrl: "https://careers.acme.test/jobs/first",
      applicationUrl: null,
      title: "Senior Software Engineer",
    });
    const second = identity({
      canonicalUrl: "https://careers.acme.test/jobs/second",
      applicationUrl: null,
      title: "Senior Data Engineer",
    });
    const index = createJobIdentityIndex([first, second], (value) => value);

    expect(
      index.find(
        identity({
          canonicalUrl: "https://careers.acme.test/jobs/new-route",
          applicationUrl: null,
          title: "Senior Data Engineer",
        }),
      ),
    ).toBe(second);
  });

  test("does not create a facts alias from a relative posted date", () => {
    const aliases = buildJobIdentityAliases(
      identity({ postedAt: null, postedAtText: "2 days ago" }),
    );

    expect(
      aliases.some((alias) => alias.kind === "corroborated_listing_facts"),
    ).toBe(false);
  });
});
