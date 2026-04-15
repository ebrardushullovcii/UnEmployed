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
})
