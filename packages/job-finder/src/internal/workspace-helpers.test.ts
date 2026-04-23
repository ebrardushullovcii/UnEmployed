import { describe, expect, test } from "vitest";

import { buildDiscoveryInstructionGuidance } from "./workspace-helpers";
import { createSourceInstructionArtifact } from "../workspace-service.test-fixtures";

describe("workspace discovery instruction guidance", () => {
  test("filters LinkedIn broad query examples while keeping detail/apply behavior", () => {
    const artifact = createSourceInstructionArtifact({
      id: "instruction_linkedin_discovery_guidance_filtering",
      targetId: "target_linkedin_default",
      status: "draft",
      createdAt: "2026-04-21T10:26:35.684Z",
      updatedAt: "2026-04-21T10:31:47.360Z",
      acceptedAt: null,
      basedOnRunId: "source_debug_target_linkedin",
      basedOnAttemptIds: ["attempt_1"],
      notes: null,
      navigationGuidance: [
        "URL-based search: /jobs/search/?keywords=...&location=...",
        "Direct navigation to /jobs/ for job hub",
        'LinkedIn jobs surface is fully accessible. Best entry path is /jobs/search/?keywords=...&location=... URL parameters. Jobs hub at /jobs/ shows recommendation rows with "Show all available jobs" and "Show all top job picks for you" links. Job listings are clickable and open detail panels. Filter button ("Show all filters") available on search results.',
      ],
      searchGuidance: [
        'LinkedIn jobs search surface has reliable controls: URL-based search with keywords/location parameters, "Show all filters" button opens inline filter panel with checkboxes (Remote, On-site, Experience level), and URL parameters like f_R=on can filter results. Jobs open in side panels, not separate pages.',
        "Apply button appears on job detail side panels",
      ],
      detailGuidance: [
        "Job listings are clickable and open detail side panels/modals",
      ],
      applyGuidance: [
        'LinkedIn jobs expose a stable apply path: click a job listing to open the side detail panel, then click the "Apply" button on that panel.',
      ],
      warnings: [],
      intelligence: {
        provider: {
          key: "linkedin",
          label: "LinkedIn Jobs",
          confidence: 0.98,
          apiAvailability: "not_supported",
          publicApiUrlTemplate: null,
          boardToken: null,
          boardSlug: null,
          providerIdentifier: "linkedin_jobs",
        },
        collection: {
          preferredMethod: "listing_route",
          rankedMethods: ["listing_route", "careers_page", "fallback_search"],
          startingRoutes: [],
          searchRouteTemplates: [],
          detailRoutePatterns: [],
          listingMarkers: [],
        },
        apply: {
          applyPath: "unknown",
          authMarkers: [],
          consentMarkers: [],
          questionSurfaceHints: [],
          resumeUploadHints: [],
        },
        reliability: {
          selectorFingerprints: [],
          stableControlNames: [],
          failureFingerprints: [],
          verifiedAt: null,
          freshnessNotes: [],
        },
        overrides: {
          forceMethod: null,
          deniedRoutePatterns: [],
          extraStartingRoutes: [],
        },
      },
      versionInfo: {
        promptProfileVersion: "source-debug-v1",
        toolsetVersion: "browser-tools-v1",
        adapterVersion: "target_site-adapter-v1",
        appSchemaVersion: "job-finder-source-debug-v1",
      },
      verification: null,
    });

    expect(buildDiscoveryInstructionGuidance(artifact)).toEqual([
      "[Search] Apply button appears on job detail side panels",
      "[Detail] Job listings are clickable and open detail side panels/modals",
      '[Apply] LinkedIn jobs expose a stable apply path: click a job listing to open the side detail panel, then click the "Apply" button on that panel.',
    ]);
  });
});
