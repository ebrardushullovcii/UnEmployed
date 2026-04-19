import { describe, expect, test, vi } from 'vitest'
import {
  createJobFinderAiClientFromEnvironment,
  createOpenAiCompatibleJobFinderAiClient
} from './index'
import {
  createEnvironment,
  createJobPosting,
  createPreferences,
  createProfile,
  createSettings,
  mockCapturingJsonFetch,
  mockJsonFetch,
  mockRejectedFetch,
  mockTextFetch
} from './test-fixtures'

describe('ai provider config and fallback behavior', () => {
  test('surfaces non-json provider errors without raw response details', async () => {
    const restoreFetch = mockTextFetch('<html>Bad Gateway</html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html' }
    })

    try {
      const client = createOpenAiCompatibleJobFinderAiClient({
        apiKey: 'test-key',
        baseUrl: 'https://example.com/v1',
        model: 'test-model',
        label: 'AI resume agent'
      })

      await expect(client.tailorResume({
        profile: createProfile(),
        searchPreferences: createPreferences(),
        settings: createSettings(),
        job: createJobPosting(),
        resumeText: 'Resume text'
      })).rejects.toThrow('Model request failed with status 502')
    } finally {
      restoreFetch()
    }
  })

  test('falls back to deterministic mode without an API key', () => {
    const client = createJobFinderAiClientFromEnvironment(createEnvironment({
      UNEMPLOYED_AI_API_KEY: undefined
    }))

    expect(client.getStatus().kind).toBe('deterministic')
  })

  test('configures the AI provider when the API key is present', () => {
    const client = createJobFinderAiClientFromEnvironment(createEnvironment())

    expect(client.getStatus()).toMatchObject({
      kind: 'openai_compatible',
      model: 'test-model',
      label: 'AI resume agent',
      modelContextWindowTokens: 196_000
    })
  })

  test('allows a direct OpenAI-compatible client to override the model context window', () => {
    const client = createOpenAiCompatibleJobFinderAiClient({
      apiKey: 'test-key',
      baseUrl: 'https://example.com/v1',
      model: 'test-model',
      label: 'AI resume agent',
      contextWindowTokens: 128_000,
    })

    expect(client.getStatus()).toMatchObject({
      kind: 'openai_compatible',
      model: 'test-model',
      label: 'AI resume agent',
      ready: true,
      modelContextWindowTokens: 128_000,
    })
  })

  test('marks the OpenAI-compatible client as not ready when config is invalid', () => {
    const client = createOpenAiCompatibleJobFinderAiClient({
      apiKey: 'test-key',
      baseUrl: 'not-a-url',
      model: '',
      label: 'AI resume agent'
    })

    expect(client.getStatus()).toMatchObject({
      kind: 'openai_compatible',
      ready: false,
      model: null,
      baseUrl: null,
      label: 'AI resume agent'
    })
  })

  test('falls back from profile extraction with logged error details and merged notes', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const restoreFetch = mockRejectedFetch(new Error('upstream extraction failure'))

    try {
      const client = createJobFinderAiClientFromEnvironment(createEnvironment())

      const result = await client.extractProfileFromResume({
        existingProfile: createProfile(),
        existingSearchPreferences: createPreferences(),
        resumeText: 'Alex Vanguard\nLondon, UK\nReact engineer'
      })

      expect(result.analysisProviderKind).toBe('deterministic')
      expect(result.notes).toContain('Fell back to the deterministic resume parser after the model call failed.')
      expect(result.notes).toContain('Primary AI extraction failed: upstream extraction failure')
      expect(errorSpy).toHaveBeenCalledWith(
        '[AI Provider] extractProfileFromResume failed; falling back to deterministic client. upstream extraction failure'
      )
    } finally {
      restoreFetch()
      errorSpy.mockRestore()
    }
  })

  test('uses the configured resume extraction timeout when normalizing abort-like provider failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const restoreFetch = mockRejectedFetch(new DOMException('This operation was aborted', 'AbortError'))

    try {
      const client = createJobFinderAiClientFromEnvironment(createEnvironment({
        UNEMPLOYED_AI_RESUME_TIMEOUT_MS: '90000'
      }))

      const result = await client.extractProfileFromResume({
        existingProfile: createProfile(),
        existingSearchPreferences: createPreferences(),
        resumeText: 'Alex Vanguard\nLondon, UK\nReact engineer'
      })

      expect(result.analysisProviderKind).toBe('deterministic')
      expect(result.notes).toContain('Primary AI extraction failed: Model request timed out after 90s')
      expect(errorSpy).toHaveBeenCalledWith(
        '[AI Provider] extractProfileFromResume failed; falling back to deterministic client. Model request timed out after 90s'
      )
    } finally {
      restoreFetch()
      errorSpy.mockRestore()
    }
  })

  test('falls back from tailoring with logged error details and merged notes', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const restoreFetch = mockRejectedFetch(new Error('upstream tailoring failure'))

    try {
      const client = createJobFinderAiClientFromEnvironment(createEnvironment())

      const result = await client.tailorResume({
        profile: createProfile(),
        searchPreferences: createPreferences(),
        settings: createSettings(),
        job: createJobPosting(),
        resumeText: 'Resume text'
      })

      expect(result.notes).toContain('Fell back to the deterministic resume tailorer after the model call failed.')
      expect(result.notes).toContain('Primary AI tailoring failed: upstream tailoring failure')
      expect(errorSpy).toHaveBeenCalledWith(
        '[AI Provider] tailorResume failed; falling back to deterministic client. upstream tailoring failure'
      )
    } finally {
      restoreFetch()
      errorSpy.mockRestore()
    }
  })

  test('uses deterministic profile copilot reply when the model returns guidance-only but deterministic can structure the edit', async () => {
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              content: 'I reviewed the setup essentials context, but I could not turn that request into a safe structured profile edit.',
              patchGroups: []
            })
          }
        }
      ]
    })

    try {
      const client = createJobFinderAiClientFromEnvironment(createEnvironment())

      const reply = await client.reviseCandidateProfile({
        profile: {
          ...createProfile(),
          yearsExperience: 6,
        },
        searchPreferences: createPreferences(),
        context: { surface: 'setup', step: 'essentials' },
        relevantReviewItems: [],
        request: 'change my experience to only 5 years',
      })

      expect(reply.patchGroups).toHaveLength(1)
      expect(reply.patchGroups[0]?.operations[0]).toEqual({
        operation: 'replace_identity_fields',
        value: {
          yearsExperience: 5,
        },
      })
    } finally {
      restoreFetch()
    }
  })

  test('uses deterministic profile copilot reply when the model gives generic no-op guidance for an existing job source request', async () => {
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              content: 'I reviewed that request in the profile context, but I could not turn it into a safe structured profile edit yet.',
              patchGroups: []
            })
          }
        }
      ]
    })

    try {
      const client = createJobFinderAiClientFromEnvironment(createEnvironment())

      const reply = await client.reviseCandidateProfile({
        profile: createProfile(),
        searchPreferences: {
          ...createPreferences(),
          discovery: {
            historyLimit: 5,
            targets: [
              {
                id: 'target_linkedin_jobs',
                label: 'LinkedIn Jobs',
                startingUrl: 'https://www.linkedin.com/jobs/search/',
                enabled: true,
                adapterKind: 'auto',
                customInstructions: null,
                instructionStatus: 'missing',
                validatedInstructionId: null,
                draftInstructionId: null,
                lastDebugRunId: null,
                lastVerifiedAt: null,
                staleReason: null,
              },
            ],
          },
        },
        context: { surface: 'profile', section: 'preferences' },
        relevantReviewItems: [],
        request: 'please add linkedin jobs again',
      })

      expect(reply.patchGroups).toEqual([])
      expect(reply.content).toContain('already saved')
    } finally {
      restoreFetch()
    }
  })

  test('uses deterministic profile copilot reply when the model gives generic no-op guidance for a direct github url', async () => {
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              content: 'I reviewed that request in the profile context, but I could not turn it into a safe structured profile edit yet.',
              patchGroups: []
            })
          }
        }
      ]
    })

    try {
      const client = createJobFinderAiClientFromEnvironment(createEnvironment())

      const reply = await client.reviseCandidateProfile({
        profile: {
          ...createProfile(),
          githubUrl: null,
        },
        searchPreferences: createPreferences(),
        context: { surface: 'profile', section: 'preferences' },
        relevantReviewItems: [],
        request: 'https://github.com/ebrardushullovcii',
      })

      expect(reply.patchGroups).toHaveLength(1)
      expect(reply.patchGroups[0]?.operations[0]).toEqual({
        operation: 'replace_identity_fields',
        value: {
          githubUrl: 'https://github.com/ebrardushullovcii',
        },
      })
    } finally {
      restoreFetch()
    }
  })

  test('uses deterministic profile copilot clarification when the model gives generic no-op guidance for visa sponsorship', async () => {
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              content: 'I reviewed that request in the profile context, but I could not turn it into a safe structured profile edit yet.',
              patchGroups: []
            })
          }
        }
      ]
    })

    try {
      const client = createJobFinderAiClientFromEnvironment(createEnvironment())

      const reply = await client.reviseCandidateProfile({
        profile: createProfile(),
        searchPreferences: createPreferences(),
        context: { surface: 'profile', section: 'preferences' },
        relevantReviewItems: [],
        request: 'update visa sponsorship',
      })

      expect(reply.patchGroups).toEqual([])
      expect(reply.content).toContain('I need visa sponsorship')
    } finally {
      restoreFetch()
    }
  })

  test('falls back cleanly for very large profile copilot requests when the primary model call fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const restoreFetch = mockRejectedFetch(new Error('upstream profile failure'))
    const longRequest = `change my experience to only 5 years ${'background detail '.repeat(5000)}`

    try {
      const client = createJobFinderAiClientFromEnvironment(createEnvironment())

      const reply = await client.reviseCandidateProfile({
        profile: {
          ...createProfile(),
          yearsExperience: 6,
        },
        searchPreferences: createPreferences(),
        context: { surface: 'setup', step: 'essentials' },
        relevantReviewItems: [],
        request: longRequest,
      })

      expect(reply.content.trim().length).toBeGreaterThan(0)
      expect(Array.isArray(reply.patchGroups)).toBe(true)
      expect(errorSpy).toHaveBeenCalledWith(
        '[AI Provider] reviseCandidateProfile failed; falling back to deterministic client. upstream profile failure'
      )
    } finally {
      restoreFetch()
      errorSpy.mockRestore()
    }
  })

  test('compacts oversized resume import stage payloads before sending them to the model', async () => {
    const capture = mockCapturingJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify({
              candidates: [],
              notes: []
            })
          }
        }
      ]
    })

    try {
      const client = createJobFinderAiClientFromEnvironment(createEnvironment())

      await client.extractResumeImportStage({
        stage: 'experience',
        existingProfile: createProfile(),
        existingSearchPreferences: createPreferences(),
        documentBundle: {
          id: 'bundle_1',
          runId: 'run_1',
          sourceResumeId: 'resume_1',
          sourceFileKind: 'pdf',
          primaryParserKind: 'pdfjs_text',
          parserKinds: ['pdfjs_text'],
          createdAt: '2026-03-20T10:00:00.000Z',
          languageHints: [],
          warnings: Array.from({ length: 20 }, (_, index) => `Warning ${index + 1} ${'detail '.repeat(40)}`),
          pages: [],
          blocks: Array.from({ length: 80 }, (_, index) => ({
            id: `block_${index + 1}`,
            pageNumber: 1 + Math.floor(index / 20),
            readingOrder: index,
            text: `Experience block ${index + 1} ${'resume evidence '.repeat(200)}`,
            kind: 'paragraph',
            sectionHint: 'experience',
            bbox: {
              left: 0,
              top: index * 10,
              width: 100,
              height: 10,
            },
            sourceParserKinds: ['pdfjs_text'],
            sourceConfidence: 0.9,
          })),
          fullText: null,
        },
      })

      const body = JSON.parse(capture.getCapturedBody()) as { messages?: Array<{ content?: string }> }
      const userPayload = JSON.parse(body.messages?.[1]?.content ?? '{}') as {
        documentBundle?: { blocks?: Array<{ text?: string }> }
      }

      expect((userPayload.documentBundle?.blocks?.length ?? 0)).toBeLessThanOrEqual(32)
      expect(userPayload.documentBundle?.blocks?.[0]?.text).toContain('[truncated')
    } finally {
      capture.restore()
    }
  })
})
