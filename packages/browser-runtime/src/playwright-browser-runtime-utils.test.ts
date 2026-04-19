import type { JobFinderAiClient } from '@unemployed/ai-providers'
import { describe, expect, test, vi } from 'vitest'
import {
  buildChromeExecutableCandidates,
  validateJobPostings,
} from './playwright-browser-runtime-utils'
import { createAgentChatWithToolsBridge } from './playwright-browser-runtime'

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')

function withPlatform(platform: NodeJS.Platform, run: () => void): void {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: platform,
  })

  try {
    run()
  } finally {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor)
    }
  }
}

describe('playwright browser runtime utils', () => {
  test('returns an empty array for non-array job posting input', () => {
    expect(validateJobPostings('not-an-array', 'unit-test')).toEqual([])
  })

  test('omits the LOCALAPPDATA chrome candidate when the env var is unavailable', () => {
    const originalLocalAppData = process.env.LOCALAPPDATA

    delete process.env.LOCALAPPDATA

    try {
      withPlatform('win32', () => {
        const candidates = buildChromeExecutableCandidates()

        expect(candidates).not.toContain('\\Google\\Chrome\\Application\\chrome.exe')
      })
    } finally {
      if (originalLocalAppData === undefined) {
        delete process.env.LOCALAPPDATA
      } else {
        process.env.LOCALAPPDATA = originalLocalAppData
      }
    }
  })

  test('forwards maxOutputTokens to the AI client during agent discovery', async () => {
    type ChatWithTools = NonNullable<JobFinderAiClient['chatWithTools']>

    const chatWithTools = vi.fn<ChatWithTools>(() =>
      Promise.resolve({
        content: 'ok',
        toolCalls: [],
      }),
    )
    const bridge = createAgentChatWithToolsBridge(chatWithTools)
    const messages = [{ role: 'user' as const, content: 'hello' }]
    const tools: [] = []
    const options = { maxOutputTokens: 321 }

    await bridge.chatWithTools(messages, tools, options)

    expect(chatWithTools).toHaveBeenCalledWith(messages, tools, options)
  })
})
