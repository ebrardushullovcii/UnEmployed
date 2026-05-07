import { afterEach, describe, expect, test, vi } from "vitest";

import { createResumeImportFixtureBundle } from "./resume-import-fixtures";
import { createProfile, createPreferences, mockCapturingJsonFetch } from "./test-fixtures";
import {
  createOpenAiCompatibleResumeVisionProvider,
  createResumeVisionProviderFromEnvironment,
} from "./resume-vision";

describe("resume vision provider", () => {
  afterEach(() => {
    // Individual mocks restore fetch explicitly; this keeps tests isolated when assertions fail early.
    vi.restoreAllMocks();
    delete process.env.UNEMPLOYED_RESUME_VISION_API_KEY;
  });

  test("normalizes model candidates and preserves visual evidence", async () => {
    const fetchMock = mockCapturingJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              candidates: [
                {
                  target: { section: "identity", key: "headline", recordId: null },
                  label: "Headline",
                  value: "Staff Platform Engineer",
                  confidence: "0.84",
                  notes: "visible near the top of the resume",
                  alternatives: "Senior Software Engineer",
                  evidenceText: "Staff Platform Engineer",
                  visualEvidence: [
                    {
                      pageNumber: 1,
                      regionHint: "top headline",
                      confidence: "0.86",
                    },
                  ],
                },
                {
                  target: { section: "unknown_section", key: "ignored" },
                  value: "ignore me",
                },
              ],
              notes: ["vision read completed"],
              warnings: ["low image contrast"],
            }),
          },
        },
      ],
    });
    const provider = createOpenAiCompatibleResumeVisionProvider({
      apiKey: "test-key",
      baseUrl: "https://example.com/v1",
      model: "FelidaeAI-Omni-3.6",
      maxPagesPerBatch: 1,
    });
    const bundle = createResumeImportFixtureBundle({
      id: "vision_test_bundle",
      pageTexts: ["Alex Vanguard\nSenior Software Engineer"],
      blocks: [
        {
          id: "block_1",
          pageNumber: 1,
          readingOrder: 0,
          text: "Alex Vanguard",
          kind: "heading",
          sectionHint: "identity",
          bbox: null,
          sourceParserKinds: ["local_pdf_layout"],
          sourceConfidence: 0.9,
        },
      ],
    });

    try {
      const result = await provider.extractResumeVision({
        existingProfile: createProfile(),
        existingSearchPreferences: createPreferences(),
        documentBundle: bundle,
        visionArtifact: {
          id: "vision_artifact_1",
          runId: "run_1",
          sourceResumeId: "resume_1",
          sourceFileKind: "pdf",
          createdAt: "2026-04-10T10:00:00.000Z",
          retained: "temporary",
          pages: [
            {
              id: "vision_page_1",
              sourceResumeId: "resume_1",
              sourceFileKind: "pdf",
              pageNumber: 1,
              renderKind: "pdf_page_image",
              mimeType: "image/png",
              width: 1200,
              height: 1600,
              byteLength: 4,
              sha256: "abc123",
              dataUrl: "data:image/png;base64,AAAA",
              storagePath: null,
              retained: "temporary",
              generatedAt: "2026-04-10T10:00:00.000Z",
              warnings: [],
            },
          ],
          warnings: [],
        },
      });

      const headline = result.candidates.find((candidate) => candidate.target.key === "headline");
      expect(result.analysisProviderKind).toBe("openai_compatible_vision");
      expect(headline?.confidence).toBe(0.84);
      expect(headline?.notes).toEqual(["visible near the top of the resume"]);
      expect(headline?.alternatives).toEqual(["Senior Software Engineer"]);
      expect(headline?.visualEvidence?.[0]).toMatchObject({
        branch: "vision",
        sourceFileKind: "pdf",
        pageNumber: 1,
        regionHint: "top headline",
        confidence: 0.86,
      });
      expect(result.candidates.some((candidate) => candidate.target.key === "ignored")).toBe(false);
      expect(fetchMock.getCapturedBody()).toContain("image_url");
    } finally {
      fetchMock.restore();
    }
  });

  test("uses the shared AI provider config for vision when vision-specific config is absent", () => {
    const provider = createResumeVisionProviderFromEnvironment({
      UNEMPLOYED_AI_API_KEY: "shared-test-key",
      UNEMPLOYED_AI_BASE_URL: "https://shared.example.com/v1",
    });

    expect(provider.getStatus()).toMatchObject({
      kind: "openai_compatible_vision",
      role: "vision",
      ready: true,
      label: "Resume visual scan",
      model: "FelidaeAI-Omni-3.6",
      baseUrl: "https://shared.example.com/v1",
      modelContextWindowTokens: 139_000,
      reservedHeadroomTokens: 30_000,
      requestTimeoutMs: 600_000,
    });
  });

  test("sends shared AI credentials and default omni model to the vision endpoint", async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = "";
    let capturedAuthorization = "";
    let capturedBody: unknown = null;

    globalThis.fetch = ((url, init) => {
      capturedUrl = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      const headers = new Headers(init?.headers);
      capturedAuthorization = headers.get("Authorization") ?? "";
      capturedBody = JSON.parse(typeof init?.body === "string" ? init.body : "{}");

      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({ candidates: [], notes: [] }),
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

    const provider = createResumeVisionProviderFromEnvironment({
      UNEMPLOYED_AI_API_KEY: "shared-test-key",
      UNEMPLOYED_AI_BASE_URL: "https://shared.example.com/v1",
    });
    const bundle = createResumeImportFixtureBundle({
      id: "shared_vision_config_bundle",
      pageTexts: ["Alex Vanguard\nSenior Software Engineer"],
      blocks: [
        {
          id: "block_1",
          pageNumber: 1,
          readingOrder: 0,
          text: "Alex Vanguard",
          kind: "heading",
          sectionHint: "identity",
          bbox: null,
          sourceParserKinds: ["local_pdf_layout"],
          sourceConfidence: 0.9,
        },
      ],
    });

    try {
      await provider.extractResumeVision({
        existingProfile: createProfile(),
        existingSearchPreferences: createPreferences(),
        documentBundle: bundle,
        visionArtifact: {
          id: "vision_artifact_shared_config",
          runId: "run_1",
          sourceResumeId: "resume_1",
          sourceFileKind: "pdf",
          createdAt: "2026-04-10T10:00:00.000Z",
          retained: "temporary",
          pages: [
            {
              id: "vision_page_1",
              sourceResumeId: "resume_1",
              sourceFileKind: "pdf",
              pageNumber: 1,
              renderKind: "pdf_page_image",
              mimeType: "image/png",
              width: 1200,
              height: 1600,
              byteLength: 4,
              sha256: "abc123",
              dataUrl: "data:image/png;base64,AAAA",
              storagePath: null,
              retained: "temporary",
              generatedAt: "2026-04-10T10:00:00.000Z",
              warnings: [],
            },
          ],
          warnings: [],
        },
      });

      expect(capturedUrl).toBe("https://shared.example.com/v1/chat/completions");
      expect(capturedAuthorization).toBe("Bearer shared-test-key");
      expect(capturedBody).toMatchObject({ model: "FelidaeAI-Omni-3.6" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("deterministic visual fallback does not treat role headlines as names", async () => {
    const provider = createResumeVisionProviderFromEnvironment({});
    const bundle = createResumeImportFixtureBundle({
      id: "role_headline_vision_fallback_bundle",
      pageTexts: ["Senior Software Engineer\nTampa, FL\nmurphyaron12@gmail.com"],
      blocks: [
        {
          id: "block_1",
          pageNumber: 1,
          readingOrder: 0,
          text: "Senior Software Engineer",
          kind: "heading",
          sectionHint: "identity",
          bbox: null,
          sourceParserKinds: ["local_pdf_layout"],
          sourceConfidence: 0.9,
        },
        {
          id: "block_2",
          pageNumber: 1,
          readingOrder: 1,
          text: "murphyaron12@gmail.com",
          kind: "contact",
          sectionHint: "contact",
          bbox: null,
          sourceParserKinds: ["local_pdf_layout"],
          sourceConfidence: 0.9,
        },
      ],
    });

    const result = await provider.extractResumeVision({
      existingProfile: createProfile(),
      existingSearchPreferences: createPreferences(),
      documentBundle: bundle,
      visionArtifact: {
        id: "vision_artifact_role_headline",
        runId: "run_1",
        sourceResumeId: "resume_1",
        sourceFileKind: "pdf",
        createdAt: "2026-04-10T10:00:00.000Z",
        retained: "temporary",
        pages: [
          {
            id: "vision_page_1",
            sourceResumeId: "resume_1",
            sourceFileKind: "pdf",
            pageNumber: 1,
            renderKind: "pdf_page_image",
            mimeType: "image/png",
            width: 1200,
            height: 1600,
            byteLength: 4,
            sha256: "abc123",
            dataUrl: "data:image/png;base64,AAAA",
            storagePath: null,
            retained: "temporary",
            generatedAt: "2026-04-10T10:00:00.000Z",
            warnings: [],
          },
        ],
        warnings: [],
      },
    });

    expect(
      result.candidates.some(
        (candidate) =>
          candidate.target.section === "identity" &&
          candidate.target.key === "fullName" &&
          candidate.value === "Senior Software Engineer",
      ),
    ).toBe(false);
    expect(
      result.candidates.some(
        (candidate) =>
          candidate.target.section === "contact" &&
          candidate.target.key === "email" &&
          candidate.value === "murphyaron12@gmail.com",
      ),
    ).toBe(true);
  });

  test("prefers vision-specific config over the shared AI provider config", () => {
    const provider = createResumeVisionProviderFromEnvironment({
      UNEMPLOYED_AI_API_KEY: "shared-test-key",
      UNEMPLOYED_AI_BASE_URL: "https://shared.example.com/v1",
      UNEMPLOYED_AI_VISION_API_KEY: "vision-test-key",
      UNEMPLOYED_AI_VISION_BASE_URL: "https://vision.example.com/v1",
      UNEMPLOYED_AI_VISION_MODEL: "test-vision-model",
      UNEMPLOYED_RESUME_VISION_API_KEY: "resume-vision-test-key",
      UNEMPLOYED_RESUME_VISION_BASE_URL: "https://resume-vision.example.com/v1",
      UNEMPLOYED_RESUME_VISION_MODEL: "resume-vision-model",
    });

    expect(provider.getStatus()).toMatchObject({
      kind: "openai_compatible_vision",
      ready: true,
      model: "resume-vision-model",
      baseUrl: "https://resume-vision.example.com/v1",
    });
  });

  test("uses the shared AI vision model override with the shared API key", () => {
    const provider = createResumeVisionProviderFromEnvironment({
      UNEMPLOYED_AI_API_KEY: "shared-test-key",
      UNEMPLOYED_AI_BASE_URL: "https://shared.example.com/v1",
      UNEMPLOYED_AI_VISION_MODEL: "shared-vision-model",
    });

    expect(provider.getStatus()).toMatchObject({
      kind: "openai_compatible_vision",
      ready: true,
      model: "shared-vision-model",
      baseUrl: "https://shared.example.com/v1",
    });
  });

  test("falls back to deterministic vision without any configured API key", () => {
    const provider = createResumeVisionProviderFromEnvironment({});

    expect(provider.getStatus()).toMatchObject({
      kind: "deterministic",
      role: "vision",
      ready: true,
      model: null,
    });
  });
});
