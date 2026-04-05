import { describe, expect, test } from 'vitest'
import {
  buildDeterministicStructuredResumeDraft,
  createOpenAiCompatibleJobFinderAiClient
} from './index'
import {
  createJobPosting,
  createPreferences,
  createProfile,
  createSettings,
  mockJsonFetch
} from './test-fixtures'

describe('openai-compatible chat and draft behavior', () => {
  test('ignores model tool calls that were not offered in the request', async () => {
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'unexpected_tool',
                  arguments: '{}'
                }
              }
            ]
          }
        }
      ]
    })

    try {
      const client = createOpenAiCompatibleJobFinderAiClient({
        apiKey: 'test-key',
        baseUrl: 'https://example.com/v1',
        model: 'test-model',
        label: 'AI resume agent'
      })

      const result = await client.chatWithTools(
        [{ role: 'user', content: 'hello' }],
        [
          {
            type: 'function',
            function: {
              name: 'expected_tool',
              description: 'Expected tool',
              parameters: {
                type: 'object',
                properties: {},
                required: []
              }
            }
          }
        ]
      )

      expect(result.toolCalls).toBeUndefined()
    } finally {
      restoreFetch()
    }
  })

  test('fills missing structured draft fields with deterministic fallback content', async () => {
    const draftPayload = { label: 'Tailored Resume', coreSkills: ['React'], notes: ['Model draft partial'] }
    const restoreFetch = mockJsonFetch({
      choices: [
        {
          message: {
            content: JSON.stringify(draftPayload)
          }
        }
      ]
    })

    try {
      const client = createOpenAiCompatibleJobFinderAiClient({
        apiKey: 'test-key',
        baseUrl: 'https://example.com/v1',
        model: 'test-model'
      })

      const input = {
        profile: createProfile(),
        searchPreferences: createPreferences(),
        settings: createSettings(),
        job: createJobPosting(),
        resumeText: 'Resume text',
        evidence: {
          summary: ['Grounded summary'],
          candidateSummary: ['Candidate summary'],
          experience: ['Built reliable interfaces'],
          skills: ['React'],
          keywords: ['TypeScript']
        },
        researchContext: {
          companyNotes: ['Company note'],
          domainVocabulary: ['workflow'],
          priorityThemes: ['systems']
        }
      } satisfies Parameters<typeof client.createResumeDraft>[0]

      const result = await client.createResumeDraft(input)
      const deterministicFallback = buildDeterministicStructuredResumeDraft(input)

      expect(result.label).toBe('Tailored Resume')
      expect(result.summary).toBe(deterministicFallback.summary)
      expect(result.experienceHighlights).toEqual(deterministicFallback.experienceHighlights)
      expect(result.fullText).toContain(result.label ?? '')
      expect(result.fullText).toContain(result.summary)
      expect(result.fullText).toContain('Core skills: React')
      expect(result.fullText).toContain('Targeted keywords: TypeScript, workflow, systems, React')
      expect(result.compatibilityScore).toBe(deterministicFallback.compatibilityScore)
      expect(result.notes).toEqual(
        expect.arrayContaining(['Model draft partial', ...deterministicFallback.notes])
      )
    } finally {
      restoreFetch()
    }
  })
})
