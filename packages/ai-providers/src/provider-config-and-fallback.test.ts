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
      label: 'AI resume agent'
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
})
