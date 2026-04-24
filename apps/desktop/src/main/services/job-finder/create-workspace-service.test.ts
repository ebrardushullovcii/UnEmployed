import { describe, expect, test } from 'vitest'
import { createDesktopJobFinderAiClient } from './create-workspace-service'

describe('createDesktopJobFinderAiClient', () => {
  test('forces the deterministic client when the desktop test API is enabled', () => {
    const client = createDesktopJobFinderAiClient({
      UNEMPLOYED_ENABLE_TEST_API: '1',
      UNEMPLOYED_AI_API_KEY: 'test-api-key'
    })

    expect(client.chatWithTools).toBeUndefined()
    expect(client.getStatus().kind).toBe('deterministic')
  })

  test('still falls back to deterministic behavior when no API key is configured', () => {
    const client = createDesktopJobFinderAiClient({
      UNEMPLOYED_ENABLE_TEST_API: '1'
    })

    expect(client.chatWithTools).toBeUndefined()
    expect(client.getStatus().kind).toBe('deterministic')
  })

  test('allows live AI when the test API explicitly requests it', () => {
    const client = createDesktopJobFinderAiClient({
      UNEMPLOYED_ENABLE_TEST_API: '1',
      UNEMPLOYED_TEST_API_USE_LIVE_AI: '1',
      UNEMPLOYED_AI_API_KEY: 'test-api-key',
      UNEMPLOYED_AI_BASE_URL: 'https://example.invalid/v1',
      UNEMPLOYED_AI_MODEL: 'test-model'
    })

    expect(client.chatWithTools).toBeTypeOf('function')
    expect(client.getStatus().kind).toBe('openai_compatible')
  })

  test('keeps deterministic behavior when live AI is requested without an API key', () => {
    const client = createDesktopJobFinderAiClient({
      UNEMPLOYED_ENABLE_TEST_API: '1',
      UNEMPLOYED_TEST_API_USE_LIVE_AI: '1',
    })

    expect(client.chatWithTools).toBeUndefined()
    expect(client.getStatus().kind).toBe('deterministic')
  })
})
