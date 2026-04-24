import { describe, expect, test } from 'vitest'
import { createDesktopJobFinderAiClient } from './create-workspace-service'
import { isBrowserAgentEnabled } from './test-api'

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

describe('isBrowserAgentEnabled', () => {
  test('defaults to enabled when the flag is unset', () => {
    expect(isBrowserAgentEnabled({})).toBe(true)
  })

  test('disables only for explicit false values', () => {
    expect(isBrowserAgentEnabled({ UNEMPLOYED_BROWSER_AGENT: '0' })).toBe(false)
    expect(isBrowserAgentEnabled({ UNEMPLOYED_BROWSER_AGENT: 'false' })).toBe(false)
    expect(isBrowserAgentEnabled({ UNEMPLOYED_BROWSER_AGENT: ' FALSE ' })).toBe(false)
  })

  test('keeps the browser agent enabled for explicit true and unknown values', () => {
    expect(isBrowserAgentEnabled({ UNEMPLOYED_BROWSER_AGENT: '1' })).toBe(true)
    expect(isBrowserAgentEnabled({ UNEMPLOYED_BROWSER_AGENT: 'TRUE' })).toBe(true)
    expect(isBrowserAgentEnabled({ UNEMPLOYED_BROWSER_AGENT: 'yes' })).toBe(true)
  })
})
