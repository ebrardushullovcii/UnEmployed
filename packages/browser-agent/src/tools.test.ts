import { describe, expect, test } from "vitest";
import {
  parseInteractiveElementsFromAriaSnapshot,
  prioritizeInteractiveElements,
  type InteractiveElementCandidate,
} from "./tools";
import {
  buildExtractedCardCandidateMergeKey,
  dedupeExtractedCardCandidates,
  MAX_GENERIC_PRIORITIZED_CARD_CANDIDATES,
  prioritizeExtractedCardCandidates,
  shouldUseSearchSurfaceJobViewCardCapture,
} from "./tooling/extraction-tools";

describe("interactive element helpers", () => {
  test("parses interactive elements from aria snapshots", () => {
    const snapshot = [
      '- navigation "Primary nav" [ref=e1]',
      '- button "Show all" [ref=e12]',
      '- searchbox "Search by title, skill, or company" [ref=e18]',
      '- link "Home" [ref=e2]',
    ].join("\n");

    expect(parseInteractiveElementsFromAriaSnapshot(snapshot)).toEqual([
      { role: "button", name: "Show all" },
      { role: "searchbox", name: "Search by title, skill, or company" },
      { role: "link", name: "Home" },
    ]);
  });

  test("prioritizes search, filters, and show-all controls above navigation noise", () => {
    const candidates: InteractiveElementCandidate[] = [
      { role: "link", name: "Home" },
      { role: "navigation", name: "Jobs" },
      { role: "link", name: "Messaging" },
      { role: "link", name: "Notifications" },
      { role: "button", name: "Show all" },
      { role: "searchbox", name: "Search by title, skill, or company" },
      { role: "button", name: "Location filter" },
      { role: "button", name: "Industry filter" },
      { role: "link", name: "Software Engineer" },
      { role: "button", name: "Show all" },
    ];

    const prioritized = prioritizeInteractiveElements(candidates, 6);

    expect(prioritized.slice(0, 5)).toEqual(
      expect.arrayContaining([
        { role: "button", name: "Show all", index: 0 },
        { role: "button", name: "Show all", index: 1 },
        {
          role: "searchbox",
          name: "Search by title, skill, or company",
          index: 0,
        },
        { role: "button", name: "Location filter", index: 0 },
        { role: "button", name: "Industry filter", index: 0 },
      ]),
    );
    expect(prioritized.some((candidate) => candidate.name === "Home")).toBe(
      false,
    );
    expect(
      prioritized.some((candidate) => candidate.role === "navigation"),
    ).toBe(false);
  });
});

describe("LinkedIn extraction helpers", () => {
  test("prefers job-view card capture on LinkedIn search results pages", () => {
    expect(
      shouldUseSearchSurfaceJobViewCardCapture(
        "https://www.linkedin.com/jobs/search/?keywords=Senior+Engineer&location=Prishtina",
      ),
    ).toBe(true);
    expect(
      shouldUseSearchSurfaceJobViewCardCapture(
        "https://www.linkedin.com/jobs/search-results/?keywords=Senior+Engineer&location=Prishtina",
      ),
    ).toBe(true);
    expect(
      shouldUseSearchSurfaceJobViewCardCapture(
        "https://www.linkedin.com/jobs/collections/recommended/",
      ),
    ).toBe(true);
  });

  test("does not enable job-view card capture outside LinkedIn search results pages", () => {
    expect(
      shouldUseSearchSurfaceJobViewCardCapture(
        "https://jobs.example.com/search",
      ),
    ).toBe(false);
    expect(
      shouldUseSearchSurfaceJobViewCardCapture(
        "https://www.linkedin.com/feed/",
      ),
    ).toBe(false);
  });

  test("prioritizes likely LinkedIn results-list cards above detail-pane or aside captures", () => {
    const candidates = prioritizeExtractedCardCandidates(
      "https://www.linkedin.com/jobs/search/?keywords=Senior+Engineer&location=Prishtina",
      [
        {
          canonicalUrl: "https://www.linkedin.com/jobs/view/detail-pane/",
          anchorText: "Frontend Engineer",
          headingText: "Frontend Engineer",
          lines: ["Frontend Engineer", "Sidebar Co", "Remote"],
          captureMeta: {
            domOrder: 0,
            rootTagName: "aside",
            rootRole: null,
            rootClassName: "jobs-search__job-details detail-pane",
            hasJobDataset: false,
            sameRootJobAnchorCount: 5,
            inLikelyResultsList: false,
            inAside: true,
            inHeader: false,
            inNavigation: false,
            inDetailPane: true,
            hasDismissLabel: false,
          },
        },
        {
          canonicalUrl: "https://www.linkedin.com/jobs/view/list-card/",
          anchorText: "Full Stack Developer (AI-First)",
          headingText: "Full Stack Developer (AI-First)",
          lines: [
            "Full Stack Developer (AI-First)",
            "Full Circle Agency",
            "Pristina (Remote)",
            "Dismiss Full Stack Developer (AI-First) job",
          ],
          captureMeta: {
            domOrder: 1,
            rootTagName: "li",
            rootRole: "listitem",
            rootClassName: "jobs-search-results__list-item job-card-container",
            hasJobDataset: true,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: true,
          },
        },
      ],
    );

    expect(candidates[0]).toEqual(
      expect.objectContaining({
        canonicalUrl: "https://www.linkedin.com/jobs/view/list-card/",
      }),
    );
  });

  test("prioritizes LinkedIn cards that better match saved role and location before the capture cap", () => {
    const candidates = prioritizeExtractedCardCandidates(
      "https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina",
      [
        {
          canonicalUrl: "https://www.linkedin.com/jobs/view/frontend-role/",
          anchorText: "Frontend Engineer",
          headingText: "Frontend Engineer",
          lines: ["Frontend Engineer", "Odiin", "Prishtina, Kosovo"],
          captureMeta: {
            domOrder: 0,
            rootTagName: "li",
            rootRole: "listitem",
            rootClassName: "jobs-search-results__list-item job-card-container",
            hasJobDataset: true,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: true,
          },
        },
        {
          canonicalUrl: "https://www.linkedin.com/jobs/view/fullstack-role/",
          anchorText: "Full Stack Developer (AI-First)",
          headingText: "Full Stack Developer (AI-First)",
          lines: [
            "Full Stack Developer (AI-First)",
            "Full Circle Agency",
            "Prishtina (Remote)",
            "Dismiss Full Stack Developer (AI-First) job",
          ],
          captureMeta: {
            domOrder: 1,
            rootTagName: "li",
            rootRole: "listitem",
            rootClassName: "jobs-search-results__list-item job-card-container",
            hasJobDataset: true,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: true,
          },
        },
      ],
      {
        targetRoles: ["Senior Full-Stack Software Engineer"],
        locations: ["Prishtina, Kosovo"],
      },
    );

    expect(candidates[0]).toEqual(
      expect.objectContaining({
        canonicalUrl: "https://www.linkedin.com/jobs/view/fullstack-role/",
      }),
    );
  });

  test("prefers outer LinkedIn result-card containers over nested dataset nodes when ranking captures", () => {
    const candidates = prioritizeExtractedCardCandidates(
      "https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina",
      [
        {
          canonicalUrl: "https://www.linkedin.com/jobs/view/nested-fragment/",
          anchorText: "Full Stack Developer (AI-First)",
          headingText: "Full Stack Developer (AI-First)",
          lines: ["Full Stack Developer (AI-First)"],
          captureMeta: {
            domOrder: 0,
            rootTagName: "div",
            rootRole: null,
            rootClassName: "job-card-container__title",
            hasJobDataset: true,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: false,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: false,
          },
        },
        {
          canonicalUrl: "https://www.linkedin.com/jobs/view/outer-card/",
          anchorText: "Full Stack Developer (AI-First)",
          headingText: "Full Stack Developer (AI-First)",
          lines: [
            "Full Stack Developer (AI-First)",
            "Full Circle Agency",
            "Prishtina (Remote)",
            "Dismiss Full Stack Developer (AI-First) job",
          ],
          captureMeta: {
            domOrder: 1,
            rootTagName: "li",
            rootRole: "listitem",
            rootClassName: "jobs-search-results__list-item job-card-container",
            hasJobDataset: true,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: true,
          },
        },
      ],
      {
        targetRoles: ["Senior Full-Stack Software Engineer"],
        locations: ["Prishtina, Kosovo"],
      },
    );

    expect(candidates[0]).toEqual(
      expect.objectContaining({
        canonicalUrl: "https://www.linkedin.com/jobs/view/outer-card/",
      }),
    );
  });

  test("downranks weak LinkedIn inner-card fragments so richer outer cards survive capture prioritization", () => {
    const candidates = prioritizeExtractedCardCandidates(
      "https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina",
      [
        {
          canonicalUrl:
            "https://www.linkedin.com/jobs/view/confidential-fragment/",
          anchorText: "Full",
          headingText: "Full",
          lines: ["Full", "Confidential Careers"],
          captureMeta: {
            domOrder: 0,
            rootTagName: "div",
            rootRole: null,
            rootClassName: "job-card-container__title",
            hasJobDataset: true,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: false,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: false,
          },
        },
        {
          canonicalUrl: "https://www.linkedin.com/jobs/view/fullstack-role/",
          anchorText: "Full Stack Developer (AI-First)",
          headingText: "Full Stack Developer (AI-First)",
          lines: [
            "Full Stack Developer (AI-First)",
            "Full Circle Agency",
            "Prishtina (Remote)",
            "Dismiss Full Stack Developer (AI-First) job",
          ],
          captureMeta: {
            domOrder: 1,
            rootTagName: "li",
            rootRole: "listitem",
            rootClassName: "jobs-search-results__list-item job-card-container",
            hasJobDataset: true,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: true,
          },
        },
      ],
      {
        targetRoles: ["Senior Full-Stack Software Engineer"],
        locations: ["Prishtina, Kosovo"],
      },
    );

    expect(candidates[0]).toEqual(
      expect.objectContaining({
        canonicalUrl: "https://www.linkedin.com/jobs/view/fullstack-role/",
        anchorText: "Full Stack Developer (AI-First)",
      }),
    );
  });

  test("prefers visible in-viewport LinkedIn result cards over offscreen cards with similar preference fit", () => {
    const candidates = prioritizeExtractedCardCandidates(
      "https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina",
      [
        {
          canonicalUrl: "https://www.linkedin.com/jobs/view/offscreen-card/",
          anchorText: "Senior Full Stack Engineer",
          headingText: "Senior Full Stack Engineer",
          lines: [
            "Senior Full Stack Engineer",
            "Another Co",
            "Prishtina, Kosovo",
          ],
          captureMeta: {
            domOrder: 0,
            rootTagName: "li",
            rootRole: "listitem",
            rootClassName: "jobs-search-results__list-item job-card-container",
            hasJobDataset: true,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: true,
            isVisible: true,
            intersectsViewport: false,
            viewportTop: 1840,
            viewportDistance: 1120,
          },
        },
        {
          canonicalUrl: "https://www.linkedin.com/jobs/view/visible-card/",
          anchorText: "Full Stack Developer (AI-First)",
          headingText: "Full Stack Developer (AI-First)",
          lines: [
            "Full Stack Developer (AI-First)",
            "Full Circle Agency",
            "Prishtina (Remote)",
            "Dismiss Full Stack Developer (AI-First) job",
          ],
          captureMeta: {
            domOrder: 1,
            rootTagName: "li",
            rootRole: "listitem",
            rootClassName: "jobs-search-results__list-item job-card-container",
            hasJobDataset: true,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: true,
            isVisible: true,
            intersectsViewport: true,
            viewportTop: 132,
            viewportDistance: 0,
          },
        },
      ],
      {
        targetRoles: ["Senior Full-Stack Software Engineer"],
        locations: ["Prishtina, Kosovo"],
      },
    );

    expect(candidates[0]).toEqual(
      expect.objectContaining({
        canonicalUrl: "https://www.linkedin.com/jobs/view/visible-card/",
      }),
    );
  });

  test("does not let stronger capture placement outrank the better full-stack role before the capture cap", () => {
    const candidates = prioritizeExtractedCardCandidates(
      "https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina",
      [
        {
          canonicalUrl:
            "https://www.linkedin.com/jobs/view/visible-frontend-card/",
          anchorText: "Senior Frontend Engineer",
          headingText: "Senior Frontend Engineer",
          lines: ["Senior Frontend Engineer", "Odiin", "Prishtina, Kosovo"],
          captureMeta: {
            domOrder: 0,
            rootTagName: "li",
            rootRole: "listitem",
            rootClassName: "jobs-search-results__list-item job-card-container",
            hasJobDataset: true,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: true,
            isVisible: true,
            intersectsViewport: true,
            viewportTop: 112,
            viewportDistance: 0,
          },
        },
        {
          canonicalUrl:
            "https://www.linkedin.com/jobs/view/offscreen-fullstack-card/",
          anchorText: "Full Stack Developer (AI-First)",
          headingText: "Full Stack Developer (AI-First)",
          lines: [
            "Full Stack Developer (AI-First)",
            "Full Circle Agency",
            "Prishtina (Remote)",
            "Dismiss Full Stack Developer (AI-First) job",
          ],
          captureMeta: {
            domOrder: 1,
            rootTagName: "li",
            rootRole: "listitem",
            rootClassName: "jobs-search-results__list-item job-card-container",
            hasJobDataset: true,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: true,
            isVisible: true,
            intersectsViewport: false,
            viewportTop: 1280,
            viewportDistance: 560,
          },
        },
      ],
      {
        targetRoles: ["Senior Full-Stack Software Engineer"],
        locations: ["Prishtina, Kosovo"],
      },
    );

    expect(candidates[0]).toEqual(
      expect.objectContaining({
        canonicalUrl:
          "https://www.linkedin.com/jobs/view/offscreen-fullstack-card/",
        anchorText: "Full Stack Developer (AI-First)",
      }),
    );
  });

  test("keeps accessible LinkedIn dismiss labels when broad card roots would otherwise crowd out the visible full-stack title", () => {
    const candidates = prioritizeExtractedCardCandidates(
      "https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina",
      [
        {
          canonicalUrl: "https://www.linkedin.com/jobs/view/fresha-broad-root/",
          anchorText: "Senior Frontend Engineer",
          headingText: "Senior Frontend Engineer",
          lines: [
            "Senior Frontend Engineer",
            "Fresha",
            "Pristina, District of Pristina, Kosovo (On-site)",
            "Viewed",
            "Promoted",
          ],
          captureMeta: {
            domOrder: 0,
            rootTagName: "li",
            rootRole: "listitem",
            rootClassName: "jobs-search-results__list-item job-card-container",
            hasJobDataset: true,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: true,
            isVisible: true,
            intersectsViewport: true,
            viewportTop: 100,
            viewportDistance: 0,
          },
        },
        {
          canonicalUrl:
            "https://www.linkedin.com/jobs/view/full-circle-broad-root/",
          anchorText: "Full Circle Agency",
          headingText: null,
          lines: [
            "Full Circle Agency • Pristina (Remote) Dismiss Full Stack Developer (AI-First) job Viewed · Posted 1 month ago",
            "Full Circle Agency",
            "Pristina (Remote)",
            "Viewed",
            "Posted 1 month ago",
          ],
          captureMeta: {
            domOrder: 1,
            rootTagName: "li",
            rootRole: "listitem",
            rootClassName: "jobs-search-results__list-item job-card-container",
            hasJobDataset: true,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: true,
            isVisible: true,
            intersectsViewport: true,
            viewportTop: 180,
            viewportDistance: 0,
          },
        },
      ],
      {
        targetRoles: ["Senior Full-Stack Software Engineer"],
        locations: ["Prishtina, Kosovo"],
      },
    );

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          canonicalUrl:
            "https://www.linkedin.com/jobs/view/full-circle-broad-root/",
          lines: expect.arrayContaining([
            "Full Circle Agency • Pristina (Remote) Dismiss Full Stack Developer (AI-First) job Viewed · Posted 1 month ago",
          ]),
        }),
      ]),
    );
  });

  test("prefers LinkedIn anchors with dismiss-style job labels over shorter company-only labels on the same broad root", () => {
    const candidates = prioritizeExtractedCardCandidates(
      "https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina",
      [
        {
          canonicalUrl:
            "https://www.linkedin.com/jobs/view/full-circle-anchor-label/",
          anchorText:
            "Full Circle Agency • Prishtina (Remote) Dismiss Full Stack Developer (AI-First) job Viewed · Posted 1 month ago",
          headingText: null,
          lines: ["Full Circle Agency", "Prishtina (Remote)"],
          captureMeta: {
            domOrder: 0,
            rootTagName: "li",
            rootRole: "listitem",
            rootClassName: "jobs-search-results__list-item job-card-container",
            hasJobDataset: true,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: true,
            isVisible: true,
            intersectsViewport: true,
            viewportTop: 120,
            viewportDistance: 0,
          },
        },
      ],
      {
        targetRoles: ["Senior Full-Stack Software Engineer"],
        locations: ["Prishtina, Kosovo"],
      },
    );

    expect(candidates[0]).toEqual(
      expect.objectContaining({
        canonicalUrl:
          "https://www.linkedin.com/jobs/view/full-circle-anchor-label/",
        anchorText:
          "Full Circle Agency • Prishtina (Remote) Dismiss Full Stack Developer (AI-First) job Viewed · Posted 1 month ago",
      }),
    );
  });

  test("keeps per-card LinkedIn job id hints scoped to the chosen result-card root", () => {
    const candidates = prioritizeExtractedCardCandidates(
      "https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina",
      [
        {
          canonicalUrl:
            "https://www.linkedin.com/jobs/search/?currentJobId=4399165260&keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina",
          anchorText: "Full Stack Developer (AI-First)",
          headingText: "Full Stack Developer (AI-First)",
          lines: [
            "Full Stack Developer (AI-First)",
            "Full Circle Agency",
            "Prishtina (Remote)",
            "Dismiss Full Stack Developer (AI-First) job",
          ],
          sourceJobIdHint: "4404542575",
          captureMeta: {
            domOrder: 1,
            rootTagName: "li",
            rootRole: "listitem",
            rootClassName: "jobs-search-results__list-item job-card-container",
            hasJobDataset: true,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: true,
          },
        },
        {
          canonicalUrl:
            "https://www.linkedin.com/jobs/search/?currentJobId=4399165260&keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina",
          anchorText: "Frontend Engineer",
          headingText: "Frontend Engineer",
          lines: ["Frontend Engineer", "Odiin", "Prishtina, Kosovo"],
          captureMeta: {
            domOrder: 0,
            rootTagName: "li",
            rootRole: "listitem",
            rootClassName: "jobs-search-results__list-item job-card-container",
            hasJobDataset: false,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: true,
          },
        },
      ],
      {
        targetRoles: ["Senior Full-Stack Software Engineer"],
        locations: ["Prishtina, Kosovo"],
      },
    );

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          anchorText: "Full Stack Developer (AI-First)",
          sourceJobIdHint: "4404542575",
        }),
        expect.objectContaining({
          anchorText: "Frontend Engineer",
        }),
      ]),
    );
    expect(
      candidates.find(
        (candidate) => candidate.anchorText === "Frontend Engineer",
      )?.sourceJobIdHint,
    ).toBeUndefined();
  });

  test("preserves LinkedIn result cards that only expose a scoped DOM job id plus a generic jobs anchor", () => {
    const candidates = prioritizeExtractedCardCandidates(
      "https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina",
      [
        {
          canonicalUrl: "https://www.linkedin.com/jobs/view/4404542575/",
          anchorText: "Full Stack Developer (AI-First)",
          headingText: "Full Stack Developer (AI-First)",
          lines: [
            "Full Stack Developer (AI-First)",
            "Full Circle Agency",
            "Prishtina (Remote)",
            "Dismiss Full Stack Developer (AI-First) job",
          ],
          sourceJobIdHint: "4404542575",
          captureMeta: {
            domOrder: 0,
            rootTagName: "li",
            rootRole: "listitem",
            rootClassName: "jobs-search-results__list-item job-card-container",
            hasJobDataset: true,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: true,
          },
        },
      ],
      {
        targetRoles: ["Senior Full-Stack Software Engineer"],
        locations: ["Prishtina, Kosovo"],
      },
    );

    expect(candidates).toEqual([
      expect.objectContaining({
        canonicalUrl: "https://www.linkedin.com/jobs/view/4404542575/",
        anchorText: "Full Stack Developer (AI-First)",
        sourceJobIdHint: "4404542575",
      }),
    ]);
  });

  test("keeps a strong LinkedIn results-list card when capture falls back to the current seeded search route", () => {
    const pageUrl =
      "https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina";

    const candidates = prioritizeExtractedCardCandidates(
      pageUrl,
      [
        {
          canonicalUrl: pageUrl,
          anchorText: "Senior Frontend Engineer",
          headingText: "Senior Frontend Engineer",
          lines: ["Senior Frontend Engineer", "Odiin", "Prishtina, Kosovo"],
          captureMeta: {
            domOrder: 0,
            rootTagName: "li",
            rootRole: "listitem",
            rootClassName: "jobs-search-results__list-item job-card-container",
            hasJobDataset: false,
            sameRootJobAnchorCount: 0,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: true,
          },
        },
        {
          canonicalUrl: pageUrl,
          anchorText: "Full Stack Developer (AI-First)",
          headingText: "Full Stack Developer (AI-First)",
          lines: [
            "Full Stack Developer (AI-First)",
            "Full Circle Agency",
            "Prishtina (Remote)",
            "Dismiss Full Stack Developer (AI-First) job",
          ],
          captureMeta: {
            domOrder: 1,
            rootTagName: "li",
            rootRole: "listitem",
            rootClassName: "jobs-search-results__list-item job-card-container",
            hasJobDataset: false,
            sameRootJobAnchorCount: 0,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: true,
          },
        },
      ],
      {
        targetRoles: ["Senior Full-Stack Software Engineer"],
        locations: ["Prishtina, Kosovo"],
      },
    );

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toEqual(
      expect.objectContaining({
        canonicalUrl: pageUrl,
        anchorText: "Full Stack Developer (AI-First)",
      }),
    );
  });

  test("prefers the anchor that matches the result-card label instead of a nested selected-detail link", () => {
    const seededSearchUrl =
      "https://www.linkedin.com/jobs/search/?currentJobId=4404057151&keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo";

    const candidates = prioritizeExtractedCardCandidates(
      seededSearchUrl,
      [
        {
          canonicalUrl: "https://www.linkedin.com/jobs/view/4404057151/",
          anchorText: "Full Stack Engineer Full",
          headingText: "Full Stack Engineer Full",
          lines: [
            "Full Stack Engineer Full Stack Engineer Confidential",
            "Remote",
          ],
          captureMeta: {
            domOrder: 0,
            rootTagName: "a",
            rootRole: null,
            rootClassName: "job-card-container__link",
            hasJobDataset: false,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: false,
          },
        },
        {
          canonicalUrl: seededSearchUrl,
          anchorText: "Full Stack Developer (AI-First)",
          headingText: "Full Stack Developer (AI-First)",
          lines: [
            "Full Stack Developer (AI-First)",
            "Full Circle Agency",
            "Prishtina (Remote)",
            "Dismiss Full Stack Developer (AI-First) job",
          ],
          sourceJobIdHint: "4404542575",
          captureMeta: {
            domOrder: 1,
            rootTagName: "li",
            rootRole: "listitem",
            rootClassName: "jobs-search-results__list-item job-card-container",
            hasJobDataset: true,
            sameRootJobAnchorCount: 2,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: true,
          },
        },
      ],
      {
        targetRoles: ["Senior Full-Stack Software Engineer"],
        locations: ["Prishtina, Kosovo"],
      },
    );

    expect(candidates[0]).toEqual(
      expect.objectContaining({
        anchorText: "Full Stack Developer (AI-First)",
        sourceJobIdHint: "4404542575",
      }),
    );
  });

  test("prefers a scoped LinkedIn DOM job id over a conflicting nested selected-detail job-view url", () => {
    const seededSearchUrl =
      "https://www.linkedin.com/jobs/search/?currentJobId=4404057151&keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo";

    const candidates = prioritizeExtractedCardCandidates(
      seededSearchUrl,
      [
        {
          canonicalUrl: "https://www.linkedin.com/jobs/view/4404057151/",
          anchorText: "Full Stack Developer (AI-First)",
          headingText: "Full Stack Developer (AI-First)",
          lines: [
            "Full Stack Developer (AI-First)",
            "Full Circle Agency",
            "Prishtina (Remote)",
            "Dismiss Full Stack Developer (AI-First) job",
          ],
          sourceJobIdHint: "4404542575",
          captureMeta: {
            domOrder: 0,
            rootTagName: "li",
            rootRole: "listitem",
            rootClassName: "jobs-search-results__list-item job-card-container",
            hasJobDataset: true,
            sameRootJobAnchorCount: 2,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: true,
          },
        },
      ],
      {
        targetRoles: ["Senior Full-Stack Software Engineer"],
        locations: ["Prishtina, Kosovo"],
      },
    );

    expect(candidates).toEqual([
      expect.objectContaining({
        anchorText: "Full Stack Developer (AI-First)",
        sourceJobIdHint: "4404542575",
      }),
    ]);
  });

  test("uses distinct merge keys for LinkedIn seeded-search cards without card-level job id proof", () => {
    const pageUrl =
      "https://www.linkedin.com/jobs/search/?currentJobId=4399165260&keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo";

    const frontendKey = buildExtractedCardCandidateMergeKey(pageUrl, {
      canonicalUrl: pageUrl,
      anchorText: "Frontend Engineer",
      headingText: "Frontend Engineer",
      lines: ["Frontend Engineer", "Odiin", "Prishtina, Kosovo"],
    });
    const fullstackKey = buildExtractedCardCandidateMergeKey(pageUrl, {
      canonicalUrl: pageUrl,
      anchorText: "Full Stack Developer (AI-First)",
      headingText: "Full Stack Developer (AI-First)",
      lines: [
        "Full Stack Developer (AI-First)",
        "Full Circle Agency",
        "Prishtina (Remote)",
      ],
    });

    expect(frontendKey).not.toBe(fullstackKey);
  });

  test("dedupes LinkedIn seeded-search cards without collapsing distinct visible cards together", () => {
    const pageUrl =
      "https://www.linkedin.com/jobs/search/?currentJobId=4399165260&keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo";

    const candidates = dedupeExtractedCardCandidates(pageUrl, [
      {
        canonicalUrl: pageUrl,
        anchorText: "Frontend Engineer",
        headingText: "Frontend Engineer",
        lines: ["Frontend Engineer", "Odiin", "Prishtina, Kosovo"],
        captureMeta: {
          domOrder: 0,
          rootTagName: "li",
          rootRole: "listitem",
          rootClassName: "jobs-search-results__list-item job-card-container",
          hasJobDataset: true,
          sameRootJobAnchorCount: 1,
          inLikelyResultsList: true,
          inAside: false,
          inHeader: false,
          inNavigation: false,
          inDetailPane: false,
          hasDismissLabel: true,
        },
      },
      {
        canonicalUrl: pageUrl,
        anchorText: "Full Stack Developer (AI-First)",
        headingText: "Full Stack Developer (AI-First)",
        lines: [
          "Full Stack Developer (AI-First)",
          "Full Circle Agency",
          "Prishtina (Remote)",
        ],
        captureMeta: {
          domOrder: 1,
          rootTagName: "li",
          rootRole: "listitem",
          rootClassName: "jobs-search-results__list-item job-card-container",
          hasJobDataset: true,
          sameRootJobAnchorCount: 1,
          inLikelyResultsList: true,
          inAside: false,
          inHeader: false,
          inNavigation: false,
          inDetailPane: false,
          hasDismissLabel: true,
        },
      },
    ]);

    expect(candidates).toHaveLength(2);
  });

  test("keeps the stronger visible LinkedIn capture meta when duplicate cards merge", () => {
    const pageUrl = "https://www.linkedin.com/jobs/view/4404542575/";

    const [candidate] = dedupeExtractedCardCandidates(pageUrl, [
      {
        canonicalUrl: pageUrl,
        anchorText: "Full Stack Developer (AI-First)",
        headingText: "Full Stack Developer (AI-First)",
        lines: [
          "Full Stack Developer (AI-First)",
          "Full Circle Agency",
          "Prishtina (Remote)",
        ],
        captureMeta: {
          domOrder: 0,
          rootTagName: "aside",
          rootRole: null,
          rootClassName: "jobs-search__job-details detail-pane",
          hasJobDataset: false,
          sameRootJobAnchorCount: 5,
          inLikelyResultsList: false,
          inAside: true,
          inHeader: false,
          inNavigation: false,
          inDetailPane: true,
          hasDismissLabel: false,
          isVisible: true,
          intersectsViewport: false,
          viewportTop: 980,
          viewportDistance: 300,
        },
      },
      {
        canonicalUrl: pageUrl,
        anchorText: "Full Stack Developer (AI-First)",
        headingText: "Full Stack Developer (AI-First)",
        lines: [
          "Full Stack Developer (AI-First)",
          "Full Circle Agency",
          "Prishtina (Remote)",
          "Dismiss Full Stack Developer (AI-First) job",
        ],
        captureMeta: {
          domOrder: 4,
          rootTagName: "li",
          rootRole: "listitem",
          rootClassName: "jobs-search-results__list-item job-card-container",
          hasJobDataset: true,
          sameRootJobAnchorCount: 1,
          inLikelyResultsList: true,
          inAside: false,
          inHeader: false,
          inNavigation: false,
          inDetailPane: false,
          hasDismissLabel: true,
          isVisible: true,
          intersectsViewport: true,
          viewportTop: 164,
          viewportDistance: 0,
        },
      },
    ]);

    expect(candidate?.captureMeta).toEqual(
      expect.objectContaining({
        rootTagName: "li",
        inLikelyResultsList: true,
        inDetailPane: false,
        intersectsViewport: true,
      }),
    );
  });

  test("keeps stronger non-LinkedIn card candidates first", () => {
    const candidates = prioritizeExtractedCardCandidates(
      "https://jobs.example.com/search",
      [
        {
          canonicalUrl: "https://jobs.example.com/jobs/1",
          anchorText: "First",
          headingText: "First",
          lines: ["First"],
          captureMeta: {
            domOrder: 1,
            rootTagName: "li",
            rootRole: "listitem",
            rootClassName: null,
            hasJobDataset: false,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: false,
          },
        },
        {
          canonicalUrl: "https://jobs.example.com/jobs/2",
          anchorText: "Second",
          headingText: "Second",
          lines: ["Second"],
          captureMeta: {
            domOrder: 0,
            rootTagName: "li",
            rootRole: "listitem",
            rootClassName: null,
            hasJobDataset: false,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: false,
          },
        },
      ],
    );

    expect(candidates.map((candidate) => candidate.canonicalUrl)).toEqual([
      "https://jobs.example.com/jobs/2",
      "https://jobs.example.com/jobs/1",
    ]);
  });

  test("prioritizes stronger non-LinkedIn technical cards before the generic carry-forward cap", () => {
    const fillerCandidates = Array.from(
      { length: MAX_GENERIC_PRIORITIZED_CARD_CANDIDATES },
      (_, index) => ({
        canonicalUrl: `https://jobs.example.com/jobs/filler-${index}`,
        anchorText: `Retail role ${index}`,
        headingText: `Retail role ${index}`,
        lines: [`Retail role ${index}`, "Generic Co", "Prishtinë"],
        captureMeta: {
          domOrder: index,
          rootTagName: "li",
          rootRole: "listitem",
          rootClassName: null,
          hasJobDataset: false,
          sameRootJobAnchorCount: 1,
          inLikelyResultsList: true,
          inAside: false,
          inHeader: false,
          inNavigation: false,
          inDetailPane: false,
          hasDismissLabel: false,
        },
      }),
    );

    const candidates = prioritizeExtractedCardCandidates(
      "https://jobs.example.com/search",
      [
        ...fillerCandidates,
        {
          canonicalUrl:
            "https://jobs.example.com/jobs/senior-fullstack-developer",
          anchorText: "Senior Fullstack Developer - SaaS",
          headingText: "Senior Fullstack Developer - SaaS",
          lines: [
            "Senior Fullstack Developer - SaaS",
            "Acme Tech",
            "Prishtinë",
          ],
          captureMeta: {
            domOrder: 40,
            rootTagName: "li",
            rootRole: "listitem",
            rootClassName: null,
            hasJobDataset: false,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: false,
          },
        },
      ],
    );

    expect(candidates).toHaveLength(MAX_GENERIC_PRIORITIZED_CARD_CANDIDATES);
    expect(candidates[0]?.canonicalUrl).toBe(
      "https://jobs.example.com/jobs/senior-fullstack-developer",
    );
  });

  test("keeps strong LinkedIn cards beyond the old top-20 carry-forward cap", () => {
    const fillerCandidates = Array.from(
      { length: MAX_GENERIC_PRIORITIZED_CARD_CANDIDATES },
      (_, index) => ({
        canonicalUrl: `https://www.linkedin.com/jobs/view/filler-${index}/`,
        anchorText: `Software Engineer ${index}`,
        headingText: `Software Engineer ${index}`,
        lines: [`Software Engineer ${index}`, "Broad Co", "Kosovo"],
        captureMeta: {
          domOrder: index,
          rootTagName: "li",
          rootRole: "listitem",
          rootClassName: "jobs-search-results__list-item",
          hasJobDataset: true,
          sameRootJobAnchorCount: 1,
          inLikelyResultsList: true,
          inAside: false,
          inHeader: false,
          inNavigation: false,
          inDetailPane: false,
          hasDismissLabel: false,
          isVisible: false,
          intersectsViewport: false,
          viewportTop: 1600 + index * 32,
          viewportDistance: 900 + index * 20,
        },
      }),
    );

    const candidates = prioritizeExtractedCardCandidates(
      "https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo",
      [
        ...fillerCandidates,
        {
          canonicalUrl:
            "https://www.linkedin.com/jobs/view/full-circle-strong/",
          anchorText: "Full Stack Developer (AI-First)",
          headingText: "Full Stack Developer (AI-First)",
          lines: [
            "Full Stack Developer (AI-First)",
            "Full Circle Agency",
            "Prishtina (Remote)",
            "Dismiss Full Stack Developer (AI-First) job",
          ],
          captureMeta: {
            domOrder: 40,
            rootTagName: "li",
            rootRole: "listitem",
            rootClassName: "jobs-search-results__list-item",
            hasJobDataset: true,
            sameRootJobAnchorCount: 1,
            inLikelyResultsList: true,
            inAside: false,
            inHeader: false,
            inNavigation: false,
            inDetailPane: false,
            hasDismissLabel: true,
            isVisible: true,
            intersectsViewport: true,
            viewportTop: 120,
            viewportDistance: 0,
          },
        },
      ],
      {
        targetRoles: ["Senior Full-Stack Software Engineer"],
        locations: ["Prishtina, Kosovo"],
      },
    );

    expect(candidates).toHaveLength(25);
    expect(candidates[0]?.canonicalUrl).toBe(
      "https://www.linkedin.com/jobs/view/full-circle-strong/",
    );
  });
});
